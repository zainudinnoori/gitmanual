import { createClient, type Client } from "@libsql/client";

// Turso in production (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN); a local SQLite file in development.
// Without either (e.g. a Vercel deploy with no database yet) everything still works, just uncached.
export const CACHE_MS = 12 * 60 * 60 * 1000;

export type RepoCard = {
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  difficulty: string;
  views: number;
  worked: number;
  stuck: number;
  analyzedAt: number;
};

export type Votes = { worked: number; stuck: number; byOs: Record<string, { worked: number; stuck: number }> };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS repos (
    key TEXT PRIMARY KEY,           -- lower-case owner/repo, plus @ref for branches
    full_name TEXT NOT NULL,
    description TEXT,
    stars INTEGER NOT NULL DEFAULT 0,
    language TEXT,
    difficulty TEXT NOT NULL,
    data TEXT NOT NULL,             -- the full /api/analyze response
    analyzed_at INTEGER NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    last_viewed INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS votes (
    key TEXT NOT NULL,
    os TEXT NOT NULL,
    worked INTEGER NOT NULL,        -- 1 = got it running, 0 = got stuck
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS votes_key ON votes (key);
  CREATE TABLE IF NOT EXISTS guides (
    key TEXT NOT NULL,
    os TEXT NOT NULL,
    text TEXT NOT NULL,             -- the AI-written guide, so each repo/OS is generated once
    created_at INTEGER NOT NULL,
    PRIMARY KEY (key, os)
  );
`;

let ready: Promise<Client | null> | null = null;

function db(): Promise<Client | null> {
  ready ??= (async () => {
    const url = process.env.TURSO_DATABASE_URL ?? (process.env.VERCEL ? null : `file:${process.env.GITSETUP_DB ?? "data/gitsetup.db"}`);
    if (!url) {
      console.warn("gitsetup: TURSO_DATABASE_URL is not set, so history and caching are off.");
      return null;
    }
    if (url.startsWith("file:")) {
      const { mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(url.slice(5)), { recursive: true });
    }
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    await client.executeMultiple(SCHEMA);
    return client;
  })().catch((e) => {
    console.error("gitsetup db:", e);
    ready = null; // try again on the next request
    return null;
  });
  return ready;
}

// The database is a cache and a counter: if it fails, the request should still succeed.
async function safely<T>(fallback: T, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await db();
  if (!c) return fallback;
  try {
    return await fn(c);
  } catch (e) {
    console.error("gitsetup db:", e);
    return fallback;
  }
}

export function repoKey(owner: string, repo: string, ref?: string): string {
  return `${owner}/${repo}`.toLowerCase() + (ref ? `@${ref}` : "");
}

export function getCached(key: string): Promise<{ data: unknown; analyzedAt: number } | null> {
  return safely(null, async (c) => {
    const { rows } = await c.execute({ sql: "SELECT data, analyzed_at FROM repos WHERE key = ?", args: [key] });
    return rows[0] ? { data: JSON.parse(String(rows[0].data)), analyzedAt: Number(rows[0].analyzed_at) } : null;
  });
}

export async function saveRepo(
  key: string,
  r: { fullName: string; description: string | null; stars: number; language: string | null; difficulty: string },
  data: unknown,
): Promise<number> {
  const now = Date.now();
  await safely(null, (c) =>
    c.execute({
      sql: `INSERT INTO repos (key, full_name, description, stars, language, difficulty, data, analyzed_at, views, last_viewed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(key) DO UPDATE SET full_name = excluded.full_name, description = excluded.description,
              stars = excluded.stars, language = excluded.language, difficulty = excluded.difficulty,
              data = excluded.data, analyzed_at = excluded.analyzed_at`,
      args: [key, r.fullName, r.description, r.stars, r.language, r.difficulty, JSON.stringify(data), now, now],
    }),
  );
  // A new analysis may change the steps, so older AI guides no longer match.
  await safely(null, (c) => c.execute({ sql: "DELETE FROM guides WHERE key = ?", args: [key] }));
  return now;
}

export function countView(key: string): Promise<unknown> {
  return safely(null, (c) => c.execute({ sql: "UPDATE repos SET views = views + 1, last_viewed = ? WHERE key = ?", args: [Date.now(), key] }));
}

export function addVote(key: string, os: string, worked: boolean): Promise<unknown> {
  return safely(null, (c) =>
    c.execute({ sql: "INSERT INTO votes (key, os, worked, created_at) VALUES (?, ?, ?, ?)", args: [key, os, worked ? 1 : 0, Date.now()] }),
  );
}

export function getVotes(key: string): Promise<Votes> {
  return safely({ worked: 0, stuck: 0, byOs: {} }, async (c) => {
    const { rows } = await c.execute({
      sql: "SELECT os, SUM(worked) AS w, COUNT(*) - SUM(worked) AS s FROM votes WHERE key = ? GROUP BY os",
      args: [key],
    });
    const list = rows.map((r) => ({ os: String(r.os), w: Number(r.w), s: Number(r.s) }));
    return {
      worked: list.reduce((n, r) => n + r.w, 0),
      stuck: list.reduce((n, r) => n + r.s, 0),
      byOs: Object.fromEntries(list.map((r) => [r.os, { worked: r.w, stuck: r.s }])),
    };
  });
}

export function getGuide(key: string, os: string): Promise<string | null> {
  return safely(null, async (c) => {
    const { rows } = await c.execute({ sql: "SELECT text FROM guides WHERE key = ? AND os = ?", args: [key, os] });
    return rows[0] ? String(rows[0].text) : null;
  });
}

export function saveGuide(key: string, os: string, text: string): Promise<unknown> {
  return safely(null, (c) =>
    c.execute({
      sql: "INSERT INTO guides (key, os, text, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(key, os) DO UPDATE SET text = excluded.text, created_at = excluded.created_at",
      args: [key, os, text, Date.now()],
    }),
  );
}

export function listRepos(order: "recent" | "popular", limit = 8): Promise<RepoCard[]> {
  return safely([], async (c) => {
    const { rows } = await c.execute({
      sql: `SELECT r.full_name, r.description, r.stars, r.language, r.difficulty, r.views, r.analyzed_at,
                   COALESCE(SUM(v.worked), 0) AS worked, COUNT(v.key) - COALESCE(SUM(v.worked), 0) AS stuck
            FROM repos r LEFT JOIN votes v ON v.key = r.key
            WHERE r.key NOT LIKE '%@%'
            GROUP BY r.key
            ORDER BY ${order === "recent" ? "r.last_viewed" : "r.views + 3 * worked"} DESC
            LIMIT ?`,
      args: [limit],
    });
    return rows.map((r) => ({
      fullName: String(r.full_name),
      description: r.description == null ? null : String(r.description),
      stars: Number(r.stars),
      language: r.language == null ? null : String(r.language),
      difficulty: String(r.difficulty),
      views: Number(r.views),
      worked: Number(r.worked),
      stuck: Number(r.stuck),
      analyzedAt: Number(r.analyzed_at),
    }));
  });
}
