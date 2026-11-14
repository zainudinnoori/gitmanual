import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { getContributors } from "../lib/github";

// Top contributors for the manual's sidebar: people only (no bots), the most first, and nothing when GitHub has no list.

const reply = (status: number, body?: unknown) =>
  mock.method(globalThis, "fetch", async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));

test("people only, in GitHub's order, capped", async () => {
  const f = reply(200, [
    { login: "ana", type: "User", avatar_url: "https://a/1", html_url: "https://github.com/ana", contributions: 900 },
    { login: "dependabot[bot]", type: "Bot", contributions: 500 },
    { login: "renovate-bot", type: "User", contributions: 400 },
    { login: "ben", type: "User", avatar_url: "https://a/2", contributions: 12 },
    { login: "cy", type: "User", avatar_url: "https://a/3", contributions: 1 },
  ]);
  const people = await getContributors({ owner: "o", repo: "r" }, 2);
  assert.deepEqual(people, [
    { login: "ana", avatar: "https://a/1", url: "https://github.com/ana", commits: 900 },
    { login: "ben", avatar: "https://a/2", url: "https://github.com/ben", commits: 12 },
  ]);
  f.mock.restore();
});

test("an empty repo, one too big to count, or a missing one: no list", async () => {
  for (const status of [204, 403, 404]) {
    const f = reply(status, status === 204 ? undefined : { message: "no" });
    assert.deepEqual(await getContributors({ owner: "o", repo: "r" }), []);
    f.mock.restore();
  }
});
