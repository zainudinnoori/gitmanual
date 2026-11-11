import { strictly } from "./db";

// Chat spends real money on every answer, so each answer is paid for from a budget before Claude is called.
// reserve() holds the answer's worst-case cost in one atomic statement, so parallel requests can't all slip under a
// limit; settle() replaces it with what the answer actually cost. Without the database nothing can be reserved, so
// chat pauses rather than spending unrecorded. Amounts are integers in millionths of a dollar.

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Dollars per million tokens. Cache writes are the five-minute kind (1.25x input). Haiku 5.5's cache prices aren't
// published separately, so they use the usual multipliers (1.25x to write, 0.1x to read). Haiku costs five times
// as much above 100K input tokens; ANSWER.maxInputTokens keeps every call under that.
export const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
} as const;

export type ChatModel = keyof typeof PRICES;

// The most one answer may use. The chat route enforces these; the reservation is sized to them, so an answer that
// stays inside them can never cost more than was held. Calls include tool continuations and retries.
export const ANSWER = { maxCalls: 4, maxInputTokens: 60_000, maxOutputTokens: 2_000, deadlineMs: 90_000 };

// A reservation still unsettled this long after it was made (a crashed worker, a lost connection) no longer
// blocks the account's next answer, but keeps its full worst-case cost in the day's spend.
const EXPIRES_MS = ANSWER.deadlineMs + MINUTE;

export type Pool = { answersPerDay: number; inProgress: number; dailyUsd: number };

// Separate pools, so signed-out chat, if it's ever added, gets its own smaller allowance and can't use up the
// signed-in users' budget.
export const POOLS = {
  user: { answersPerDay: 15, inProgress: 1, dailyUsd: 5 },
} satisfies Record<string, Pool>;

export type PoolName = keyof typeof POOLS;

// The token counts Claude returns on every response.
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

// Tokens times dollars per million tokens is millionths of a dollar, so no conversion is needed.
export function usageCost(model: ChatModel, u: Usage): number {
  const p = PRICES[model];
  return Math.ceil(
    u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead,
  );
}

// Every call at its limits, with all input billed as a cache write, the dearest kind.
export function worstCase(model: ChatModel): number {
  const call = usageCost(model, { input_tokens: 0, cache_creation_input_tokens: ANSWER.maxInputTokens, output_tokens: ANSWER.maxOutputTokens });
  return ANSWER.maxCalls * call;
}

export type BudgetReason = "busy" | "answers" | "site" | "unavailable";

export class BudgetError extends Error {
  constructor(
    message: string,
    public reason: BudgetReason,
    public retryAfter: number, // seconds
  ) {
    super(message);
  }
}

export type Reservation =
  | { key: string; duplicate: false; reserved: number }
  // The same question was sent again (a double click, a retry): nothing new is held or charged.
  | { key: string; duplicate: true; status: "reserved" | "settled" };

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const untilMidnight = (now: number) => Math.max(1, Math.ceil((DAY - (now % DAY)) / 1000));

export async function reserve(opts: {
  pool: PoolName;
  account: string;
  requestId: string; // made by the browser once per question, so a resend carries the same one
  model: ChatModel;
  now?: number;
  limits?: Pool; // tests only; the pool's own limits otherwise
}): Promise<Reservation> {
  const { pool, account, requestId, model } = opts;
  if (!account) throw new Error("reserve: an account is required");
  if (!/^[\w-]{8,64}$/.test(requestId)) throw new Error("reserve: requestId must be 8-64 letters, digits, _ or -");
  const now = opts.now ?? Date.now();
  const limits = opts.limits ?? POOLS[pool];
  const key = `${pool}:${account}:${requestId}`;
  const day = utcDay(now);
  const amount = worstCase(model);

  try {
    return await strictly(async (c) => {
      // One statement: the checks and the insert can't be split by a parallel request. An expired reservation still
      // counts toward the day's answers and spend, just not toward "in progress".
      const inserted = await c.execute({
        sql: `INSERT INTO chat_spend (key, pool, account, day, reserved, status, created_at, expires_at)
          SELECT :key, :pool, :account, :day, :amount, 'reserved', :now, :expires
          WHERE (SELECT COUNT(*) FROM chat_spend WHERE pool = :pool AND account = :account AND day = :day) < :answers
            AND (SELECT COUNT(*) FROM chat_spend WHERE pool = :pool AND account = :account AND status = 'reserved' AND expires_at > :now) < :inProgress
            AND (SELECT COALESCE(SUM(COALESCE(cost, reserved)), 0) FROM chat_spend WHERE pool = :pool AND day = :day) + :amount <= :cap
          ON CONFLICT (key) DO NOTHING`,
        args: {
          key,
          pool,
          account,
          day,
          amount,
          now,
          expires: now + EXPIRES_MS,
          answers: limits.answersPerDay,
          inProgress: limits.inProgress,
          cap: Math.round(limits.dailyUsd * 1_000_000),
        },
      });
      if (inserted.rowsAffected === 1) return { key, duplicate: false, reserved: amount };

      // Refused or already there: work out which, to say why.
      const existing = await c.execute({ sql: "SELECT status FROM chat_spend WHERE key = ?", args: [key] });
      if (existing.rows.length) return { key, duplicate: true, status: existing.rows[0].status as "reserved" | "settled" };

      const { rows } = await c.execute({
        sql: `SELECT
          (SELECT COUNT(*) FROM chat_spend WHERE pool = :pool AND account = :account AND status = 'reserved' AND expires_at > :now) AS busy,
          (SELECT COUNT(*) FROM chat_spend WHERE pool = :pool AND account = :account AND day = :day) AS answers`,
        args: { pool, account, day, now },
      });
      if (Number(rows[0].busy) >= limits.inProgress)
        throw new BudgetError("An answer is still being written. Wait for it to finish, then ask again.", "busy", 5);
      if (Number(rows[0].answers) >= limits.answersPerDay)
        throw new BudgetError(
          `You've used your ${limits.answersPerDay} answers for today. They come back at midnight UTC; the manual and Ask Claude / ChatGPT still work.`,
          "answers",
          untilMidnight(now),
        );
      throw new BudgetError(
        "Chat has reached today's limit for everyone and is paused until midnight UTC. The manual and Ask Claude / ChatGPT still work.",
        "site",
        untilMidnight(now),
      );
    });
  } catch (e) {
    if (e instanceof BudgetError) throw e;
    console.error("gitmanual budget:", e);
    throw new BudgetError("Chat is paused for a moment. The manual and Ask Claude / ChatGPT still work.", "unavailable", 60);
  }
}

// Records what the answer actually cost (every model call it made), replacing the worst case that was held.
// If this fails, the reservation keeps its worst-case cost, which errs on the side of spending less, so it logs
// rather than throws.
export async function settle(key: string, model: ChatModel, usages: Usage[], now = Date.now()): Promise<boolean> {
  const cost = usages.reduce((sum, u) => sum + usageCost(model, u), 0);
  try {
    return await strictly(async (c) => {
      const r = await c.execute({
        sql: "UPDATE chat_spend SET status = 'settled', cost = ?, settled_at = ? WHERE key = ? AND status = 'reserved'",
        args: [cost, now, key],
      });
      return r.rowsAffected === 1;
    });
  } catch (e) {
    console.error("gitmanual budget:", e);
    return false;
  }
}

// Gives the answer back when Claude was never called (the repo couldn't be loaded, the request was invalid), so a
// failure on our side doesn't use up one of the person's answers.
export async function release(key: string): Promise<boolean> {
  try {
    return await strictly(async (c) => {
      const r = await c.execute({ sql: "DELETE FROM chat_spend WHERE key = ? AND status = 'reserved'", args: [key] });
      return r.rowsAffected === 1;
    });
  } catch (e) {
    console.error("gitmanual budget:", e);
    return false;
  }
}

// What the chat box shows: "12 of 15 answers left today". Null when the database can't say.
export async function allowance(
  pool: PoolName,
  account: string,
  now = Date.now(),
): Promise<{ used: number; limit: number; resetsIn: number } | null> {
  const limit = POOLS[pool].answersPerDay;
  try {
    return await strictly(async (c) => {
      const { rows } = await c.execute({
        sql: "SELECT COUNT(*) AS used FROM chat_spend WHERE pool = ? AND account = ? AND day = ?",
        args: [pool, account, utcDay(now)],
      });
      return { used: Number(rows[0].used), limit, resetsIn: untilMidnight(now) };
    });
  } catch (e) {
    console.error("gitmanual budget:", e);
    return null;
  }
}

export type ChatStats = {
  days: { day: string; answers: number; people: number; spent: number; avg: number | null; atLimit: number }[];
  atLimit: { day: string; account: string; answers: number }[];
  live: { chats: number; repos: { repo: string; chats: number }[] };
  limits: { answersPerDay: number; dailyUsd: number };
};

// For the admin page (app/admin/chat): answers, people and spend per day, who used all their answers, and the
// chats open right now. Spend counts unsettled reservations at their worst case, as the daily cap does.
export async function chatStats(days = 14, now = Date.now()): Promise<ChatStats> {
  const since = utcDay(now - (days - 1) * DAY);
  const { answersPerDay, dailyUsd } = POOLS.user;
  return strictly(async (c) => {
    const perDay = await c.execute({
      sql: `SELECT day, COUNT(*) AS answers, COUNT(DISTINCT account) AS people,
              SUM(CASE WHEN status = 'settled' THEN cost ELSE reserved END) AS spent,
              AVG(CASE WHEN status = 'settled' THEN cost END) AS avg
            FROM chat_spend WHERE pool = 'user' AND day >= ? GROUP BY day ORDER BY day DESC`,
      args: [since],
    });
    const full = await c.execute({
      sql: `SELECT day, account, COUNT(*) AS answers FROM chat_spend WHERE pool = 'user' AND day >= ?
            GROUP BY day, account HAVING COUNT(*) >= ? ORDER BY day DESC, answers DESC`,
      args: [since, answersPerDay],
    });
    const live = await c.execute({
      sql: "SELECT repo, COUNT(*) AS chats FROM chat_conversations WHERE expires_at > ? GROUP BY repo ORDER BY chats DESC",
      args: [now],
    });
    const atLimit = full.rows.map((r) => ({ day: String(r.day), account: String(r.account), answers: Number(r.answers) }));
    return {
      days: perDay.rows.map((r) => ({
        day: String(r.day),
        answers: Number(r.answers),
        people: Number(r.people),
        spent: Number(r.spent ?? 0) / 1e6,
        avg: r.avg === null ? null : Number(r.avg) / 1e6,
        atLimit: atLimit.filter((a) => a.day === String(r.day)).length,
      })),
      atLimit,
      live: { chats: live.rows.reduce((n, r) => n + Number(r.chats), 0), repos: live.rows.slice(0, 10).map((r) => ({ repo: String(r.repo), chats: Number(r.chats) })) },
      limits: { answersPerDay, dailyUsd },
    };
  });
}
