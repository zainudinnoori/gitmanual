import { createHash } from "node:crypto";
import { hit } from "./db";
import { GitHubError } from "./github";

// Limits on what costs something: new repo analyses use the GitHub API quota (5,000 requests an hour,
// about 3 per repo), AI guides cost Anthropic credits, votes should count people rather than clicks.
// Anything already saved (manuals, guides) is never limited. RATE_LIMITS=off turns them all off.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Rule = { visitor: [max: number, windowMs: number]; site?: [max: number, windowMs: number]; message: string };

const RULES = {
  analyze: {
    visitor: [40, HOUR],
    site: [1000, HOUR],
    message: "You've opened a lot of new repos in the last hour. Repos already on the shelf still open right away; new ones can be read again in a little while.",
  },
  guide: {
    visitor: [5, DAY],
    site: [100, DAY],
    message: "That's the limit of new AI guides for today. Guides that are already written still open, and the steps above don't need one.",
  },
  vote: { visitor: [30, HOUR], message: "Thanks! That's a lot of votes for one hour; try again later." },
} satisfies Record<string, Rule>;

export type LimitedAction = keyof typeof RULES;

export class LimitError extends GitHubError {
  constructor(
    message: string,
    public retryAfter: number, // seconds
  ) {
    super(message, 429);
  }
}

const on = () => process.env.RATE_LIMITS !== "off";

// A visitor is a hash of their IP address and the date, so nothing stored can be traced back to an address
// and it changes every day. Vercel and most proxies put the caller's address in these headers.
export function visitor(headers: Headers): string {
  const ip =
    headers.get("x-real-ip") ?? headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip.trim()}|${day}|${process.env.LIMIT_SALT ?? ""}`).digest("hex").slice(0, 20);
}

async function over(bucket: string, [max, windowMs]: [number, number]): Promise<number | null> {
  const { count, resetAt } = await hit(bucket, windowMs);
  return count > max ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : null;
}

// Counts one use and throws a LimitError (status 429) once the visitor or the whole site is over the limit.
export async function limit(action: LimitedAction, who: string): Promise<void> {
  if (!on()) return;
  const rule: Rule = RULES[action];
  const mine = await over(`${action}:${who}`, rule.visitor);
  if (mine) throw new LimitError(rule.message, mine);
  if (rule.site) {
    const all = await over(`${action}:site`, rule.site);
    if (all) throw new LimitError("gitmanual is very busy right now. Repos already on the shelf still open; new ones can be read again soon.", all);
  }
}

// True the first time a visitor does something within the window ("one vote per repo and system a day").
export async function firstTime(bucket: string, who: string, windowMs = DAY): Promise<boolean> {
  if (!on()) return true;
  return (await hit(`${bucket}:${who}`, windowMs)).count <= 1;
}

// For loadRepo: count a new analysis against the visitor who asked for it.
export function analyzeGate(headers: Headers): () => Promise<void> {
  return () => limit("analyze", visitor(headers));
}

export function limitHeaders(e: LimitError): Record<string, string> {
  return { "Retry-After": String(e.retryAfter) };
}
