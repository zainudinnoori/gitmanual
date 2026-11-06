import { AsyncLocalStorage } from "node:async_hooks";
import { parseRepoUrl } from "./github";
import type { Arch } from "./install";
import { analyzeGate } from "./limit";
import { manualFacts, type ManualFacts } from "./manual";
import { OS_LIST, type OS } from "./os";
import { loadRepo } from "./pipeline";

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

// One repo's manual facts for the JSON API and the MCP server. Accepts "owner/repo" or any GitHub link.
export async function lookupManual(repo: string, opts: { os?: OS; arch?: Arch | null; headers?: Headers } = {}): Promise<ManualFacts> {
  const ref = parseRepoUrl(repo);
  if (!ref) throw new Error(`"${repo}" isn't a GitHub repo. Use owner/repo, e.g. ollama/ollama.`);
  const headers = opts.headers ?? requestHeaders.getStore() ?? new Headers();
  const { data, analyzedAt } = await loadRepo(ref, { gate: analyzeGate(headers) });
  return manualFacts(data, analyzedAt, SITE, { os: opts.os, arch: opts.arch });
}
