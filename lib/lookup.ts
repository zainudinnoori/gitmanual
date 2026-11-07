import { BadRequest } from "./api";
import { AsyncLocalStorage } from "node:async_hooks";
import { GitHubError, parseRepoUrl, type RepoRef } from "./github";
import type { Arch } from "./install";
import { apiCaller, apiGate, needKeyForPrivate, type Caller } from "./apikeys";
import { getVotes, repoKey } from "./db";
import { manualFacts, type ManualFacts } from "./manual";
import { OS_LIST, type OS } from "./os";
import { loadPrivate, loadRepo, type RepoData } from "./pipeline";

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

// The headers of the request being served, for code that's called without it (MCP tools), so new analyses
// still count against the visitor who asked for them.
export const requestHeaders = new AsyncLocalStorage<Headers>();

export function parseOs(v: string | null | undefined): OS | undefined {
  const s = v?.toLowerCase();
  if (!s) return undefined;
  if (/^(mac|macos|osx|darwin)$/.test(s)) return "mac";
  if (/^(win|windows)$/.test(s)) return "windows";
  return OS_LIST.includes(s as OS) ? (s as OS) : undefined;
}

export function parseArch(v: string | null | undefined): Arch | null {
  const s = v?.toLowerCase();
  return s === "arm64" || s === "aarch64" ? "arm64" : s === "x64" || s === "amd64" || s === "x86_64" ? "x64" : null;
}

// The caller's own GitHub token, for their private repos: the X-GitHub-Token header on API and MCP requests.
export const callerToken = (headers: Headers) => headers.get("x-github-token")?.trim() || undefined;

const PRIVATE_HINT =
  `Repository not found, or it's private. For your private repos, add your gitmanual API key and your own read-only GitHub token (see ${SITE}/developers).`;

// A repo for the API and the MCP server. Public repos come from the shelf as usual (saved, fast); new ones count
// against the caller's key or, without one, the anonymous limit (lib/apikeys.ts). Only when GitHub says "not
// found" and the caller sent a GitHub token (and has a key) is it read again with that token, for that request alone.
export async function loadForCaller(
  ref: RepoRef,
  headers: Headers,
  known?: Caller, // already checked by the route (lib/api.ts), so the key isn't counted twice
): Promise<{ data: RepoData; analyzedAt: number; caller: Caller }> {
  const caller = known ?? (await apiCaller(headers));
  const token = callerToken(headers);
  try {
    return { ...(await loadRepo(ref, { gate: apiGate(caller) })), caller };
  } catch (e) {
    if (!(e instanceof GitHubError) || e.status !== 404) throw e;
    if (!token) throw new GitHubError(PRIVATE_HINT, 404);
  }
  needKeyForPrivate(caller);
  await apiGate(caller)();
  return { ...(await loadPrivate(ref, token)), caller };
}

// One repo's manual facts for the JSON API and the MCP server. Accepts "owner/repo" or any GitHub link.
export async function lookupManual(
  repo: string,
  opts: { os?: OS; arch?: Arch | null; headers?: Headers; caller?: Caller } = {},
): Promise<{ facts: ManualFacts; caller: Caller }> {
  const ref = parseRepoUrl(repo);
  if (!ref) throw new BadRequest(`"${repo}" isn't a GitHub repo. Use owner/repo, e.g. ollama/ollama.`);
  const headers = opts.headers ?? requestHeaders.getStore() ?? new Headers();
  const { data, analyzedAt, caller } = await loadForCaller(ref, headers, opts.caller);
  const votes = data.meta.private ? undefined : await getVotes(repoKey(...(data.meta.fullName.split("/") as [string, string])));
  return { facts: manualFacts(data, analyzedAt, SITE, { os: opts.os, arch: opts.arch }, votes), caller };
}
