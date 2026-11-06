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
  risingAt: number | null; // when the trending job last found it rising
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
  CREATE TABLE IF NOT EXISTS fb_posts (
    id TEXT PRIMARY KEY,            -- the Facebook post id
    repo TEXT NOT NULL,             -- owner/repo found in the caption
    kind TEXT NOT NULL,             -- poster | reel
    caption TEXT,
    permalink TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    image BLOB,                     -- a copy: Facebook's image links expire
    image_type TEXT,
    synced_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guides (
    key TEXT NOT NULL,
    os TEXT NOT NULL,
    text TEXT NOT NULL,             -- the AI-written guide, so each repo/OS is generated once
    created_at INTEGER NOT NULL,
    PRIMARY KEY (key, os)
  );
  CREATE TABLE IF NOT EXISTS hits (
    bucket TEXT PRIMARY KEY,        -- what is counted, e.g. "analyze:<hashed visitor>" (never a raw IP)
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL       -- when the window ends and counting starts over
  );
`;

// One connection per server process. Kept on globalThis because dev hot reloads re-run this module,
// and a fresh connection per reload leaves stale handles on the SQLite file (they end in SQLITE_IOERR).
const store = globalThis as typeof globalThis & { gitmanualDb?: Promise<Client | null> | null };

function db(): Promise<Client | null> {
  store.gitmanualDb ??= (async () => {
    const url = process.env.TURSO_DATABASE_URL ?? (process.env.VERCEL ? null : `file:${process.env.GITMANUAL_DB ?? "data/gitmanual.db"}`);
    if (!url) {
      console.warn("gitmanual: TURSO_DATABASE_URL is not set, so history and caching are off.");
      return null;
    }
    if (url.startsWith("file:")) {
      const { mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(url.slice(5)), { recursive: true });
    }
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    try {
      await client.executeMultiple(SCHEMA);
      // Columns added after a table first shipped; "duplicate column" just means it's already there.
      for (const sql of [
        "ALTER TABLE fb_posts ADD COLUMN video_id TEXT",
        "ALTER TABLE repos ADD COLUMN rising_at INTEGER", // when the daily trending job last found it rising
      ])
        await client.execute(sql).catch(() => {});
    } catch (e) {
      client.close();
      throw e;
    }
    return client;
  })().catch((e) => {
    console.error("gitmanual db:", e);
    store.gitmanualDb = null; // try again on the next request
    return null;
  });
  return store.gitmanualDb;
}

// The database is a cache and a counter: if it fails, the request should still succeed.
async function safely<T>(fallback: T, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await db();
  if (!c) return fallback;
  try {
    return await fn(c);
  } catch (e) {
    console.error("gitmanual db:", e);
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

// The trending job marks repos it finds rising. A repo keeps its date while it's still rising, and gets a fresh
// one if it rises again a month later, so "Rising this week" is a rolling week.
export function markRising(key: string): Promise<unknown> {
  const now = Date.now();
  return safely(null, (c) =>
    c.execute({
      sql: "UPDATE repos SET rising_at = ? WHERE key = ? AND (rising_at IS NULL OR rising_at < ?)",
      args: [now, key, now - 30 * 864e5],
    }),
  );
}

// How many repos are rising this week, for "See all N on the shelf".
export function countRising(): Promise<number> {
  return safely(0, async (c) => {
    const { rows } = await c.execute({ sql: "SELECT COUNT(*) AS n FROM repos WHERE key NOT LIKE '%@%' AND rising_at > ?", args: [Date.now() - 7 * 864e5] });
    return Number(rows[0]?.n ?? 0);
  });
}

export function listRepos(order: "recent" | "popular" | "rising", limit = 6): Promise<RepoCard[]> {
  return safely([], async (c) => {
    const { rows } = await c.execute({
      sql: `SELECT r.full_name, r.description, r.stars, r.language, r.difficulty, r.views, r.analyzed_at, r.rising_at,
                   COALESCE(SUM(v.worked), 0) AS worked, COUNT(v.key) - COALESCE(SUM(v.worked), 0) AS stuck
            FROM repos r LEFT JOIN votes v ON v.key = r.key
            WHERE r.key NOT LIKE '%@%' ${order === "rising" ? "AND r.rising_at > ?" : ""}
            GROUP BY r.key
            ORDER BY ${order === "recent" ? "r.last_viewed" : order === "rising" ? "r.stars" : "r.views + 3 * worked"} DESC
            LIMIT ?`,
      args: order === "rising" ? [Date.now() - 7 * 864e5, limit] : [limit],
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
      risingAt: r.rising_at == null ? null : Number(r.rising_at),
    }));
  });
}

export type ShelfQuery = {
  q?: string;
  language?: string;
  difficulty?: string;
  minStars?: number;
  sort?: "stars" | "recent" | "popular" | "worked";
  rising?: boolean; // only repos rising this week
  page?: number;
};

export const SHELF_PAGE = 24;

const SHELF_ORDER: Record<NonNullable<ShelfQuery["sort"]>, string> = {
  stars: "r.stars DESC",
  recent: "r.last_viewed DESC",
  popular: "r.views DESC, r.stars DESC",
  worked: "worked DESC, r.stars DESC",
};

// Every repo people have looked up, filtered and sorted for the /shelf page.
export function browseRepos(
  query: ShelfQuery,
): Promise<{ repos: RepoCard[]; total: number; languages: { name: string; count: number }[]; all: number; rising: number }> {
  return safely({ repos: [], total: 0, languages: [], all: 0, rising: 0 }, async (c) => {
    const where = ["r.key NOT LIKE '%@%'"];
    const args: (string | number)[] = [];
    if (query.q) {
      where.push("(r.full_name LIKE ? OR r.description LIKE ?)");
      args.push(`%${query.q}%`, `%${query.q}%`);
    }
    if (query.language) {
      where.push("r.language = ?");
      args.push(query.language);
    }
    if (query.difficulty) {
      where.push("r.difficulty = ?");
      args.push(query.difficulty);
    }
    if (query.minStars) {
      where.push("r.stars >= ?");
      args.push(query.minStars);
    }
    const weekAgo = Date.now() - 7 * 864e5;
    if (query.rising) {
      where.push("r.rising_at > ?");
      args.push(weekAgo);
    }
    const filter = where.join(" AND ");
    const page = Math.max(1, query.page ?? 1);
    const [rows, count, langs, rising] = await Promise.all([
      c.execute({
        sql: `SELECT r.full_name, r.description, r.stars, r.language, r.difficulty, r.views, r.analyzed_at, r.rising_at,
                     COALESCE(SUM(v.worked), 0) AS worked, COUNT(v.key) - COALESCE(SUM(v.worked), 0) AS stuck
              FROM repos r LEFT JOIN votes v ON v.key = r.key
              WHERE ${filter}
              GROUP BY r.key
              ORDER BY ${SHELF_ORDER[query.sort ?? "stars"]}
              LIMIT ? OFFSET ?`,
        args: [...args, SHELF_PAGE, (page - 1) * SHELF_PAGE],
      }),
      c.execute({ sql: `SELECT COUNT(*) AS n FROM repos r WHERE ${filter}`, args }),
      c.execute(
        "SELECT language, COUNT(*) AS n FROM repos WHERE key NOT LIKE '%@%' AND language IS NOT NULL GROUP BY language ORDER BY n DESC, language",
      ),
      // The whole shelf and this week's rising repos, for the All / Rising switch.
      c.execute({
        sql: "SELECT COUNT(*) AS n, COALESCE(SUM(rising_at > ?), 0) AS rising FROM repos WHERE key NOT LIKE '%@%'",
        args: [weekAgo],
      }),
    ]);
    return {
      repos: rows.rows.map((r) => ({
        fullName: String(r.full_name),
        description: r.description == null ? null : String(r.description),
        stars: Number(r.stars),
        language: r.language == null ? null : String(r.language),
        difficulty: String(r.difficulty),
        views: Number(r.views),
        worked: Number(r.worked),
        stuck: Number(r.stuck),
        analyzedAt: Number(r.analyzed_at),
        risingAt: r.rising_at == null ? null : Number(r.rising_at),
      })),
      total: Number(count.rows[0]?.n ?? 0),
      languages: langs.rows.map((r) => ({ name: String(r.language), count: Number(r.n) })),
      all: Number(rising.rows[0]?.n ?? 0),
      rising: Number(rising.rows[0]?.rising ?? 0),
    };
  });
}

// Every repo page for the sitemap, most looked-up first (search engines read the top of big sitemaps first).
export function sitemapRepos(limit = 45000): Promise<{ fullName: string; analyzedAt: number }[]> {
  return safely([], async (c) => {
    const { rows } = await c.execute({
      sql: "SELECT full_name, analyzed_at FROM repos WHERE key NOT LIKE '%@%' ORDER BY views DESC, stars DESC LIMIT ?",
      args: [limit],
    });
    return rows.map((r) => ({ fullName: String(r.full_name), analyzedAt: Number(r.analyzed_at) }));
  });
}

// ---------- Facebook page posts (see lib/facebook.ts) ----------

export type FbPost = {
  id: string;
  repo: string;
  kind: "poster" | "reel";
  caption: string | null;
  permalink: string;
  createdAt: number;
  videoId?: string | null; // Reels: the video, for playing it on the page
  syncedAt?: number;
};

export function fbKnownIds(): Promise<Set<string>> {
  return safely(new Set<string>(), async (c) => new Set((await c.execute("SELECT id FROM fb_posts")).rows.map((r) => String(r.id))));
}

export function saveFbPost(p: FbPost, image: { bytes: Uint8Array; type: string } | null): Promise<unknown> {
  return safely(null, (c) =>
    c.execute({
      sql: `INSERT INTO fb_posts (id, repo, kind, caption, permalink, created_at, image, image_type, synced_at, video_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET repo = excluded.repo, kind = excluded.kind, caption = excluded.caption, video_id = excluded.video_id,
              permalink = excluded.permalink, image = COALESCE(excluded.image, fb_posts.image),
              image_type = COALESCE(excluded.image_type, fb_posts.image_type), synced_at = excluded.synced_at`,
      args: [p.id, p.repo, p.kind, p.caption, p.permalink, p.createdAt, image?.bytes ?? null, image?.type ?? null, Date.now(), p.videoId ?? null],
    }),
  );
}

export function listFbPosts(): Promise<FbPost[]> {
  return safely([], async (c) =>
    (await c.execute("SELECT id, repo, kind, caption, permalink, created_at, synced_at, video_id FROM fb_posts ORDER BY created_at DESC LIMIT 500")).rows.map((r) => ({
      id: String(r.id),
      repo: String(r.repo),
      kind: r.kind === "reel" ? ("reel" as const) : ("poster" as const),
      caption: r.caption == null ? null : String(r.caption),
      permalink: String(r.permalink),
      createdAt: Number(r.created_at),
      syncedAt: Number(r.synced_at),
      videoId: r.video_id == null ? null : String(r.video_id),
    })),
  );
}

export function fbImage(id: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  return safely(null, async (c) => {
    const row = (await c.execute({ sql: "SELECT image, image_type FROM fb_posts WHERE id = ?", args: [id] })).rows[0];
    return row?.image ? { bytes: row.image as ArrayBuffer, type: String(row.image_type ?? "image/jpeg") } : null;
  });
}

// Repo names on the shelf, for matching a post that names a project without linking it ("Peekaboo lets agents…").
// Only names that belong to exactly one repo.
export function shelfNames(): Promise<Map<string, string>> {
  return safely(new Map<string, string>(), async (c) => {
    const rows = (await c.execute("SELECT full_name FROM repos WHERE key NOT LIKE '%@%'")).rows.map((r) => String(r.full_name));
    const byName = new Map<string, string[]>();
    for (const full of rows) {
      // "lossless-cut", "LosslessCut" and "losslesscut" are the same name.
      const name = full.split("/")[1].toLowerCase().replace(/[-_.]/g, "");
      byName.set(name, [...(byName.get(name) ?? []), full]);
    }
    return new Map([...byName].filter(([, list]) => list.length === 1).map(([name, [full]]) => [name, full]));
  });
}

// Counts one use of a limited action in a fixed time window; returns the count so far, or 0 when the
// database is unavailable (limits then let requests through rather than blocking everyone).
export function hit(bucket: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
  return safely({ count: 0, resetAt: 0 }, async (c) => {
    const now = Date.now();
    const { rows } = await c.execute({
      sql: `INSERT INTO hits (bucket, count, reset_at) VALUES (?, 1, ?)
            ON CONFLICT (bucket) DO UPDATE SET
              count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
              reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
            RETURNING count, reset_at`,
      args: [bucket, now + windowMs, now, now],
    });
    // Now and then, clear out windows that have ended.
    if (Math.random() < 0.02) await c.execute({ sql: "DELETE FROM hits WHERE reset_at <= ?", args: [now] });
    return { count: Number(rows[0].count), resetAt: Number(rows[0].reset_at) };
  });
}
