import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// A throwaway SQLite file, set before lib/db.ts first opens the database.
process.env.GITMANUAL_DB = join(mkdtempSync(join(tmpdir(), "gitmanual-budget-")), "test.db");
delete process.env.TURSO_DATABASE_URL;

const { BudgetError, reserve, settle, release, allowance, usageCost, worstCase } = await import("../lib/budget");

const MODEL = "claude-sonnet-5-5" as const;
const NOON = Date.UTC(2026, 10, 10, 12); // a fixed day, so the tests don't depend on the clock
const id = (n: number | string) => `request-${n}`;
const roomy = { answersPerDay: 1000, inProgress: 1000, dailyUsd: 1000 };

test("usage is priced per million tokens, cache reads and writes included", () => {
  assert.equal(usageCost(MODEL, { input_tokens: 1000, output_tokens: 500 }), 1000 * 2 + 500 * 10);
  assert.equal(
    usageCost(MODEL, { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000 }),
    1000 * 2.5 + 1000 * 0.2,
  );
  // 4 calls x (60K cache-write input + 2K output) on Sonnet 5.5 = $0.68.
  assert.equal(worstCase(MODEL), 680_000);
});

test("a reservation is settled with the actual cost", async () => {
  const r = await reserve({ pool: "user", account: "settle", requestId: id(1), model: MODEL, now: NOON, limits: roomy });
  assert.equal(r.duplicate, false);
  assert.equal(await settle(r.key, MODEL, [{ input_tokens: 1000, output_tokens: 100 }], NOON), true);
  // Settling twice changes nothing.
  assert.equal(await settle(r.key, MODEL, [{ input_tokens: 1, output_tokens: 1 }], NOON), false);
});

test("the same question sent twice is held and charged once", async () => {
  const first = await reserve({ pool: "user", account: "dup", requestId: id("same"), model: MODEL, now: NOON, limits: roomy });
  const again = await reserve({ pool: "user", account: "dup", requestId: id("same"), model: MODEL, now: NOON, limits: roomy });
  assert.equal(first.duplicate, false);
  assert.deepEqual(again, { key: first.key, duplicate: true, status: "reserved" });
  assert.equal((await allowance("user", "dup", NOON))?.used, 1);
});

test("parallel requests from many accounts can't go over the site's daily budget", async () => {
  // $2 fits two worst-case Sonnet answers ($1.36); a third would be $2.04.
  const limits = { answersPerDay: 100, inProgress: 100, dailyUsd: 2 };
  const day = NOON + 2 * 24 * 60 * 60 * 1000; // a day of its own, so earlier tests' spend doesn't count
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) => reserve({ pool: "user", account: `site-${i}`, requestId: id(i), model: MODEL, now: day, limits })),
  );
  const held = results.filter((r) => r.status === "fulfilled");
  const refused = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
  assert.equal(held.length, 2);
  assert.ok(refused.every((e) => e instanceof BudgetError && e.reason === "site"));
});

test("one account gets one answer at a time, even in parallel", async () => {
  const limits = { answersPerDay: 100, inProgress: 1, dailyUsd: 1000 };
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) => reserve({ pool: "user", account: "busy", requestId: id(i), model: MODEL, now: NOON, limits })),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const refused = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
  assert.ok(refused.every((e) => e instanceof BudgetError && e.reason === "busy"));

  // Once that answer is settled, the next one can start.
  const done = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ key: string }>;
  await settle(done.value.key, MODEL, [{ input_tokens: 10, output_tokens: 10 }], NOON);
  const next = await reserve({ pool: "user", account: "busy", requestId: id("next"), model: MODEL, now: NOON, limits });
  assert.equal(next.duplicate, false);
});

test("answers per day run out, and come back the next UTC day", async () => {
  const limits = { answersPerDay: 3, inProgress: 10, dailyUsd: 1000 };
  for (let i = 0; i < 3; i++) await reserve({ pool: "user", account: "daily", requestId: id(i), model: MODEL, now: NOON, limits });
  await assert.rejects(
    reserve({ pool: "user", account: "daily", requestId: id(3), model: MODEL, now: NOON, limits }),
    (e) => e instanceof BudgetError && e.reason === "answers" && e.retryAfter === 12 * 60 * 60,
  );
  const tomorrow = NOON + 24 * 60 * 60 * 1000;
  const r = await reserve({ pool: "user", account: "daily", requestId: id(4), model: MODEL, now: tomorrow, limits });
  assert.equal(r.duplicate, false);
});

test("a reservation that's never settled stops blocking the account but keeps its cost", async () => {
  const day = NOON + 5 * 24 * 60 * 60 * 1000;
  const limits = { answersPerDay: 100, inProgress: 1, dailyUsd: 1 }; // fits one worst-case answer ($0.68)
  await reserve({ pool: "user", account: "crash", requestId: id(1), model: MODEL, now: day, limits });
  // Five minutes later the crashed answer has expired, so the account isn't "busy"...
  const later = day + 5 * 60 * 1000;
  await assert.rejects(
    reserve({ pool: "user", account: "crash", requestId: id(2), model: MODEL, now: later, limits }),
    // ...but its $0.68 still counts, so a second worst case ($1.36) is over the $1 budget.
    (e) => e instanceof BudgetError && e.reason === "site",
  );
});

test("an answer released before Claude was called isn't counted", async () => {
  const r = await reserve({ pool: "user", account: "release", requestId: id(1), model: MODEL, now: NOON, limits: roomy });
  assert.equal(await release(r.key), true);
  assert.equal((await allowance("user", "release", NOON))?.used, 0);
  // A settled answer can't be released.
  const s = await reserve({ pool: "user", account: "release", requestId: id(2), model: MODEL, now: NOON, limits: roomy });
  await settle(s.key, MODEL, [{ input_tokens: 1, output_tokens: 1 }], NOON);
  assert.equal(await release(s.key), false);
});

test("without a database, chat pauses instead of spending unrecorded", () => {
  // A deploy with no database configured: lib/db.ts gets no URL, so nothing can be reserved.
  const env = { ...process.env, VERCEL: "1" };
  delete env.TURSO_DATABASE_URL;
  delete env.GITMANUAL_DB;
  const code = `import("./lib/budget.ts").then(({ reserve }) => reserve({ pool: "user", account: "x", requestId: "request-1", model: "claude-haiku-5-5" })).then(() => console.log("RESERVED"), (e) => console.log("REASON " + e.reason))`;
  const out = spawnSync(process.execPath, ["--import", "tsx", "-e", code], { cwd: join(dirname(fileURLToPath(import.meta.url)), ".."), env, encoding: "utf8" });
  assert.match(out.stdout, /REASON unavailable/, out.stderr);
});
