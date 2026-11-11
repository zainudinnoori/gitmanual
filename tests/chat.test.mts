import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWER } from "../lib/budget";
import { answer, buildContext, CHAT, maskSecrets, readablePath } from "../lib/chat";
import type { RepoFile } from "../lib/github";
import type { RepoData } from "../lib/pipeline";

const SHA = "a".repeat(40);

// Enough of RepoData for the context builder.
const repo = (files: Record<string, string>, doc?: string) =>
  ({ meta: { fullName: "owner/name", description: "A tool" }, analysis: { stack: ["Node.js"] }, files, guides: doc ? { doc: { path: doc } } : null }) as unknown as RepoData;

// A stand-in for the Anthropic client: each call returns the next scripted message, and records what it was sent.
function fakeClient(script: { content: any[]; stop_reason: string }[]) {
  const calls: any[] = [];
  const client = {
    messages: {
      stream(params: any) {
        calls.push(structuredClone(params));
        const next = script.shift();
        if (!next) throw new Error("no more scripted responses");
        const listeners: ((t: string) => void)[] = [];
        return {
          on(event: string, cb: (t: string) => void) {
            if (event === "text") listeners.push(cb);
            return this;
          },
          async finalMessage() {
            for (const b of next.content) if (b.type === "text") listeners.forEach((l) => l(b.text));
            return { ...next, usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
          },
        };
      },
    },
  };
  return { client: client as any, calls };
}

const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
const toolUse = (id: string, path: string) => ({ content: [{ type: "tool_use", id, name: "read_repo_file", input: { path } }], stop_reason: "tool_use" });
const run = (client: any, readFile: (p: string) => Promise<RepoFile>, extra: Partial<Parameters<typeof answer>[0]> = {}) => {
  const events: any[] = [];
  const progress = { started: 0, usages: [] as any[] };
  const done = answer({
    client,
    model: "claude-haiku-5-5",
    context: "<repo/>",
    history: [],
    question: "How do I install it?",
    os: "mac",
    readFile,
    emit: (e) => events.push(e),
    deadline: Date.now() + 60_000,
    progress,
    ...extra,
  });
  return { done, events, progress };
};

test("README and the setup guide come first; a file that doesn't fit is cut and marked", () => {
  const big = "x".repeat(CHAT.fileChars + 500);
  const ctx = buildContext(repo({ ".github/workflows/ci.yml": "ci", "package.json": big, "README.md": "readme", "docs/setup.md": "setup" }, "docs/setup.md"), SHA, ["README.md"], false);
  const order = [...ctx.matchAll(/<file path="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["README.md", "docs/setup.md", "package.json", ".github/workflows/ci.yml"]);
  assert.match(ctx, /<file path="package.json" truncated="true" total_chars="15500">/);
  assert.match(ctx, new RegExp(`commit="${SHA}"`));
});

test("the files stay inside the context budget", () => {
  const files = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`file${String(i).padStart(2, "0")}.json`, "y".repeat(CHAT.fileChars)]));
  const ctx = buildContext(repo(files), SHA, [], false);
  const fileChars = [...ctx.matchAll(/<file [^>]*>\n([\s\S]*?)\n<\/file>/g)].reduce((n, m) => n + m[1].length, 0);
  assert.ok(fileChars <= CHAT.contextChars);
  assert.match(ctx, /<not_included>/);
});

test("likely secrets are masked; placeholders and plain words are not", () => {
  const masked = maskSecrets(
    [
      "token ghp_" + "A".repeat(36),
      "aws AKIAABCDEFGHIJKLMNOP",
      "API_KEY=9f8e7d6c5b4a3210fedcba9876543210",
      "API_KEY=your-api-key-goes-here-please",
      "DATABASE_PASSWORD=changeme_changeme_changeme",
    ].join("\n"),
  );
  assert.doesNotMatch(masked, /ghp_A|AKIAABCD|9f8e7d6c/);
  assert.match(masked, /API_KEY=your-api-key-goes-here-please/);
  assert.match(masked, /DATABASE_PASSWORD=changeme_changeme_changeme/);
  assert.equal((masked.match(/\[secret removed\]/g) ?? []).length, 3);
});

test("the file tool only takes relative paths that don't name a secret", () => {
  for (const ok of ["README.md", "docs/install.md", ".env.example", "config/.env.sample"]) assert.ok(readablePath(ok), ok);
  for (const bad of ["", "/etc/passwd", "../x", "a/../../b", "a\\b", ".env", "config/.env.production", "deploy/id_rsa", "certs/server.pem", ".npmrc"])
    assert.ok(!readablePath(bad), bad);
});

test("a tool read in the middle of an answer is answered, and every call is counted", async () => {
  const { client, calls } = fakeClient([toolUse("t1", "docs/install.md"), text("Run `npm install` (from `docs/install.md`).")]);
  const read: string[] = [];
  const { done, events, progress } = run(client, async (p) => (read.push(p), { kind: "file", text: "npm install" }));
  const result = await done;
  assert.equal(result.stop, "done");
  assert.deepEqual(read, ["docs/install.md"]);
  assert.equal(progress.started, 2);
  assert.equal(result.usages.length, 2);
  // The history alternates correctly: question, tool call, tool result, answer.
  assert.deepEqual(result.messages.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  assert.equal((result.messages[2].content as any[])[0].tool_use_id, "t1");
  assert.ok(events.some((e) => e.type === "reading" && e.path === "docs/install.md"));
  assert.ok(events.some((e) => e.type === "text"));
  // The repo context is the cached part of every call.
  assert.deepEqual(calls[0].system[1].cache_control, { type: "ephemeral" });
});

test("an answer can't make more model calls than the budget reserved for", async () => {
  const script = Array.from({ length: ANSWER.maxCalls + 2 }, (_, i) => toolUse(`t${i}`, `f${i}.md`));
  const { client, calls } = fakeClient(script);
  const result = await run(client, async () => ({ kind: "file", text: "x" })).done;
  assert.equal(calls.length, ANSWER.maxCalls);
  // The last call is told it can't use tools, so it has to answer with what it has.
  assert.deepEqual(calls.at(-1).tool_choice, { type: "none" });
  assert.equal(calls[0].tool_choice, undefined);
  assert.equal(result.stop, "calls");
});

test("a refused path is reported to Claude as an error, and GitHub is never asked", async () => {
  const { client } = fakeClient([toolUse("t1", "../../etc/passwd"), text("I can't read that.")]);
  let asked = false;
  const result = await run(client, async () => ((asked = true), { kind: "file", text: "" })).done;
  assert.equal(asked, false);
  const toolResult = (result.messages[2].content as any[])[0];
  assert.equal(toolResult.is_error, true);
});

test("a conversation too long for the token allowance stops before calling Claude", async () => {
  const { client, calls } = fakeClient([text("never sent")]);
  const huge = "z".repeat(ANSWER.maxInputTokens * 4);
  const { done, progress } = run(client, async () => ({ kind: "missing" }), { context: huge });
  const result = await done;
  assert.equal(result.stop, "full");
  assert.equal(calls.length, 0);
  assert.equal(progress.started, 0);
});

test("a call that fails midway still shows as started, so its cost isn't given back", async () => {
  const { client } = fakeClient([toolUse("t1", "a.md")]); // the second call has nothing scripted and throws
  const { done, progress } = run(client, async () => ({ kind: "file", text: "a" }));
  await assert.rejects(done);
  assert.equal(progress.started, 2);
  assert.equal(progress.usages.length, 1);
});
