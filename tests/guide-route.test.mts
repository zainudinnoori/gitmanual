import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";

// "Write my guide": saved guides are free to read; a new one needs GitHub sign-in, one a day on the free plan and
// up to 20 with Pro, and what it cost is recorded. Runs the real route and budget against a throwaway database;
// sign-in, Pro, the repo and Claude are stand-ins, so nothing here spends money or calls out.

process.env.GITMANUAL_DB = join(mkdtempSync(join(tmpdir(), "gitmanual-guide-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
process.env.ANTHROPIC_API_KEY = "test";
process.env.PRO_ENABLED = "on";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

const lib = (path: string) => new URL(`../lib/${path}`, import.meta.url).href;

let signedIn: { id: number; login: string } | null = null;
const proUsers = new Set<number>();
let calls = 0;

mock.module(lib("viewer.ts"), {
  exports: { viewer: async () => ({ user: signedIn && { ...signedIn, token: "t" }, settle: (r: unknown) => r }), isAdmin: () => false },
});
mock.module(lib("pro.ts"), { exports: { isPro: async (id: number) => proUsers.has(id), proFor: async () => ({ pro: false, subscription: null }) } });
mock.module(lib("pipeline.ts"), {
  exports: {
    loadRepo: async (ref: { owner: string; repo: string }) => ({
      key: `${ref.owner}/${ref.repo}`.toLowerCase(),
      data: {
        meta: { fullName: `${ref.owner}/${ref.repo}`, branch: "main", description: "A tool" },
        analysis: { steps: { mac: [], windows: [], linux: [] }, osNotes: { mac: [], windows: [], linux: [] } },
        install: { release: null, commands: [] },
        files: { "README.md": "Run `npm install`." },
      },
    }),
  },
});
mock.module(lib("limit.ts"), { exports: { analyzeGate: () => async () => {} } });

class FakeAnthropic {
  static RateLimitError = class extends Error {};
  beta = {
    messages: {
      stream() {
        calls++;
        const text = "## Setup\n\nRun `npm install`.";
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "content_block_delta", delta: { type: "text_delta", text } };
          },
          finalMessage: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 500 } }),
        };
      },
    },
  };
}
mock.module("@anthropic-ai/sdk", { defaultExport: FakeAnthropic });

const { GET, POST } = await import("../app/api/guide/route");
const { strictly } = await import("../lib/db");

const write = async (repo: string, os = "mac") => {
  const res = await POST(new Request("http://localhost/api/guide", { method: "POST", body: JSON.stringify({ url: repo, os }) }));
  return { status: res.status, text: await res.text(), cached: res.headers.get("X-Guide-Cached") };
};
const status = async (repo: string, os = "mac") => (await GET(new Request(`http://localhost/api/guide?url=${repo}&os=${os}`))).json();

test("signed out: a new guide asks for sign-in, and Claude isn't called", async () => {
  signedIn = null;
  const r = await write("a/one");
  assert.equal(r.status, 401);
  assert.match(r.text, /Sign in with GitHub/);
  assert.equal(calls, 0);
  assert.deepEqual(await status("a/one"), { saved: false, signedIn: false, pro: false, left: null, proOffer: true });
});

test("free: one new guide a day, its real cost recorded; saved guides stay free for everyone", async () => {
  signedIn = { id: 1, login: "free" };
  assert.equal((await status("a/one")).left, 1);
  const first = await write("a/one");
  assert.equal(first.status, 200);
  assert.match(first.text, /npm install/);
  assert.equal(calls, 1);

  // 1,000 tokens in and 500 out on Opus 5.5 ($4 and $20 per million) is $0.014.
  const { rows } = await strictly((c) => c.execute("SELECT pool, status, cost FROM chat_spend WHERE account = '1'"));
  assert.deepEqual(rows.map((r) => [r.pool, r.status, Number(r.cost)]), [["guide", "settled", 14000]]);

  const second = await write("a/two");
  assert.equal(second.status, 429);
  assert.match(second.text, /today's free guide.*get Pro/);
  assert.equal(calls, 1);
  assert.equal((await status("a/two")).left, 0);

  signedIn = null;
  const saved = await write("a/one");
  assert.equal(saved.status, 200);
  assert.equal(saved.cached, "1");
  assert.equal(calls, 1);
  assert.equal((await status("a/one")).saved, true);
});

test("Pro: more guides a day, from Pro's own allowance", async () => {
  signedIn = { id: 2, login: "pro" };
  proUsers.add(2);
  assert.equal((await status("b/one")).left, 20);
  for (const repo of ["b/one", "b/two", "b/three"]) assert.equal((await write(repo)).status, 200);
  assert.equal((await status("b/four")).left, 17);
  const { rows } = await strictly((c) => c.execute("SELECT DISTINCT pool FROM chat_spend WHERE account = '2'"));
  assert.deepEqual(rows.map((r) => r.pool), ["guidePro"]);
});
