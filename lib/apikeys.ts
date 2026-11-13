import { createHash, randomBytes } from "node:crypto";
import { keyByHash, useKey } from "./db";
import { GitHubError } from "./github";
import { limit, visitor } from "./limit";
import { isPro } from "./pro";

// API keys for the JSON API and the MCP server. Anyone can use both without one: 60 requests an hour, 10 of them
// new repos a day. A free key, made by signing in with GitHub on /developers, raises that to 250 requests and
// 50 new repos an hour, and opens private repos. A key whose owner has GitManual Pro gets 5,000 requests and 1,000
// new repos an hour. Keys are stored only as a hash; the owner sees theirs once.
//   Authorization: Bearer gm_…

export type Caller = { kind: "anon"; who: string } | { kind: "key"; githubId: number; login: string; pro?: boolean };

export class KeyError extends GitHubError {} // 401 (wrong key, or a key needed) and 403 (blocked)

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function newKey(): { key: string; hash: string; prefix: string } {
  const key = `gm_${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 9) };
}

const DEVELOPERS = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://gitmanual.com").replace(/\/$/, "")}/developers`;

// Who's asking: the key's owner, or an anonymous visitor (by the same daily scrambled code as the website).
// A key that's wrong or blocked is refused outright, so a typo doesn't quietly fall back to the low limit.
// Each call counts one request against the caller's hourly limit, so call it once per request (or MCP tool call).
export async function apiCaller(headers: Headers): Promise<Caller> {
  const anon = async (): Promise<Caller> => {
    const who = visitor(headers);
    await limit("apiAnonCalls", who);
    return { kind: "anon", who };
  };
  const key = headers.get("authorization")?.match(/^Bearer\s+(gm_\S+)$/i)?.[1];
  if (!key) return anon();
  const hash = hashKey(key);
  const found = await keyByHash(hash);
  if (found === "error") return anon(); // database down: still serve, at the anonymous limit
  if (!found) throw new KeyError(`That API key isn't valid. Make a new one at ${DEVELOPERS}.`, 401);
  if (found.blocked) throw new KeyError("This API key has been turned off. Get in touch through gitmanual.com/contact.", 403);
  // Pro is checked on each request, so the higher limits start and stop with the subscription.
  const pro = await isPro(found.githubId);
  await limit(pro ? "apiProCalls" : "apiKeyCalls", String(found.githubId));
  await useKey(hash);
  return { kind: "key", githubId: found.githubId, login: found.login, pro };
}

// For loadRepo's gate: counts a new repo against the key, or the anonymous visitor.
export const apiGate = (c: Caller) => () =>
  c.kind === "key" ? limit(c.pro ? "apiPro" : "apiKey", String(c.githubId)) : limit("apiAnon", c.who);

export function needKeyForPrivate(c: Caller) {
  if (c.kind === "anon") throw new KeyError(`Private repos need a free gitmanual API key as well as your GitHub token. Get one at ${DEVELOPERS}.`, 401);
}
