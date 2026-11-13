import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";

// API keys and their limits, against a throwaway database: a free key counts toward the free limits, a key whose
// owner has GitManual Pro toward the Pro ones (5× higher). Whether someone has Pro is a stand-in here.

process.env.GITMANUAL_DB = join(mkdtempSync(join(tmpdir(), "gitmanual-keys-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
delete process.env.RATE_LIMITS;

const lib = (path: string) => new URL(`../lib/${path}`, import.meta.url).href;
const proUsers = new Set<number>();
mock.module(lib("pro.ts"), { exports: { isPro: async (id: number) => proUsers.has(id), proFor: async () => ({ pro: false, subscription: null }) } });

const { apiCaller, apiGate, hashKey, newKey } = await import("../lib/apikeys");
const { saveKey, strictly } = await import("../lib/db");

const count = async (bucket: string) =>
  Number((await strictly((c) => c.execute({ sql: "SELECT count FROM hits WHERE bucket = ?", args: [bucket] }))).rows[0]?.count ?? 0);

async function keyFor(githubId: number, login: string) {
  const k = newKey();
  assert.equal(await saveKey({ hash: k.hash, prefix: k.prefix, githubId, login }), true);
  assert.equal(hashKey(k.key), k.hash);
  return new Headers({ authorization: `Bearer ${k.key}` });
}

test("a free key counts toward the free limits", async () => {
  const caller = await apiCaller(await keyFor(1, "free"));
  assert.deepEqual(caller, { kind: "key", githubId: 1, login: "free", pro: false });
  await apiGate(caller)();
  assert.equal(await count("apiKeyCalls:1"), 1);
  assert.equal(await count("apiKey:1"), 1);
  assert.equal(await count("apiProCalls:1"), 0);
});

test("a Pro owner's key counts toward the Pro limits, and goes back when Pro ends", async () => {
  const headers = await keyFor(2, "pro");
  proUsers.add(2);
  const caller = await apiCaller(headers);
  assert.equal(caller.kind === "key" && caller.pro, true);
  await apiGate(caller)();
  assert.equal(await count("apiProCalls:2"), 1);
  assert.equal(await count("apiPro:2"), 1);
  assert.equal(await count("apiKeyCalls:2"), 0);

  proUsers.delete(2);
  await apiCaller(headers);
  assert.equal(await count("apiKeyCalls:2"), 1);
});
