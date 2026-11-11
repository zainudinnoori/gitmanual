import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { getRepoFile, listPaths } from "../lib/github";

// Launch tests for chat's read_repo_file: what GitHub can hand back for a path that isn't an ordinary file.
// GitHub is replaced by a fake fetch that answers the way its contents API does.

const REF = { owner: "owner", repo: "name" };
const SHA = "b".repeat(40);
const MAX = 100_000;

let requests: string[] = [];
let bytesSent = 0;

// Streams `body` in 16 KB chunks, counting what's actually sent, so a capped read can be told from a full one.
function respond(status: number, body: string): Response {
  const bytes = new TextEncoder().encode(body);
  let at = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (at >= bytes.length) return c.close();
      const chunk = bytes.subarray(at, at + 16_384);
      at += chunk.length;
      bytesSent += chunk.length;
      c.enqueue(chunk);
    },
  });
  return new Response(stream, { status });
}

function github(answer: (path: string) => Response) {
  requests = [];
  bytesSent = 0;
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    requests.push(url.pathname + url.search);
    return answer(decodeURIComponent(url.pathname.split("/contents/")[1] ?? ""));
  }) as typeof fetch;
}

// The id git gives content: what GitHub reports as a file's sha.
const blobSha = (text: string) => {
  const bytes = Buffer.from(text);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};

const file = (path: string, text: string, size = Buffer.byteLength(text), sha = blobSha(text)) =>
  JSON.stringify({ type: "file", path, sha, size, encoding: "base64", content: Buffer.from(text).toString("base64") });

test("an ordinary file is read at the pinned commit", async () => {
  github((p) => respond(200, file(p, "npm install\n")));
  assert.deepEqual(await getRepoFile(REF, SHA, "docs/install.md", MAX), { kind: "file", text: "npm install\n" });
  assert.match(requests[0], new RegExp(`/repos/owner/name/contents/docs/install\\.md\\?ref=${SHA}$`));
});

test("a symlink to a file is refused, not followed to its target", async () => {
  // As github.com/git/git's RelNotes: GitHub answers a link to a file under the link's own path and blob sha,
  // with the target's content.
  github((p) => respond(200, file(p, "the target's release notes", undefined, blobSha("Documentation/RelNotes/2.47.0.txt"))));
  assert.deepEqual(await getRepoFile(REF, SHA, "RelNotes", MAX), { kind: "not-a-file" });
});

test("a symlink to a folder, a submodule and a folder are refused", async () => {
  github(() => respond(200, JSON.stringify({ type: "symlink", path: "link", target: "../outside", size: 10 })));
  assert.deepEqual(await getRepoFile(REF, SHA, "link", MAX), { kind: "not-a-file" });

  github(() => respond(200, JSON.stringify({ type: "submodule", path: "vendor/lib", submodule_git_url: "https://github.com/other/lib" })));
  assert.deepEqual(await getRepoFile(REF, SHA, "vendor/lib", MAX), { kind: "not-a-file" });

  github(() => respond(200, JSON.stringify([{ type: "file", path: "docs/a.md" }])));
  assert.deepEqual(await getRepoFile(REF, SHA, "docs", MAX), { kind: "not-a-file" });
});

test("an oversized file stops downloading at the limit, whatever size GitHub reports", async () => {
  const big = "x".repeat(2_000_000);
  // GitHub claims it's small; the download is still cut off.
  github((p) => respond(200, file(p, big, 10)));
  assert.deepEqual(await getRepoFile(REF, SHA, "dump.sql", MAX), { kind: "too-large" });
  // A few chunks past the limit at most (streams read a little ahead), never the whole 2.7 MB response.
  assert.ok(bytesSent < 2 * MAX * 1.4, `downloaded ${bytesSent} bytes`);

  // Fits in the download but GitHub says it's over: refused too.
  github((p) => respond(200, file(p, "small", MAX + 1)));
  assert.deepEqual(await getRepoFile(REF, SHA, "big.txt", MAX), { kind: "too-large" });

  // Over 1 MB, GitHub sends no content at all.
  github((p) => respond(200, JSON.stringify({ type: "file", path: p, size: 5_000_000, encoding: "none", content: "" })));
  assert.deepEqual(await getRepoFile(REF, SHA, "huge.bin", MAX), { kind: "too-large" });
});

test("binary files and missing paths are reported, not read", async () => {
  github((p) => respond(200, file(p, "PNG\u0000\u0001\u0002")));
  assert.deepEqual(await getRepoFile(REF, SHA, "logo.png", MAX), { kind: "binary" });

  github(() => respond(404, JSON.stringify({ message: "Not Found" })));
  assert.deepEqual(await getRepoFile(REF, SHA, "nope.md", MAX), { kind: "missing" });
});

test("the path list leaves out symlinks and submodules", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      truncated: false,
      tree: [
        { path: "README.md", type: "blob", mode: "100644" },
        { path: "install.sh", type: "blob", mode: "100755" },
        { path: "RelNotes", type: "blob", mode: "120000" }, // symlink
        { path: "vendor/lib", type: "commit", mode: "160000" }, // submodule
        { path: "docs", type: "tree", mode: "040000" },
      ],
    })) as typeof fetch;
  assert.deepEqual(await listPaths(REF, SHA), { paths: ["README.md", "install.sh"], truncated: false });
});
