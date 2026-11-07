// Copies the local SQLite history (data/gitmanual.db) into a Turso database:
// the shelf, votes, cached AI guides and synced Facebook posts with their images.
// Safe to re-run: rows that already exist are replaced, not duplicated.
//
//   1. Put TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.production.local (git-ignored)
//   2. npm run db:push
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@libsql/client";

const envFile = ".env.production.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error(`Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in ${envFile} first.`);
  process.exit(1);
}
const localPath = process.env.GITMANUAL_DB ?? "data/gitmanual.db";
if (!existsSync(localPath)) {
  console.error(`No local database at ${localPath}.`);
  process.exit(1);
}

const local = createClient({ url: `file:${localPath}` });
const remote = createClient({ url, authToken });

// Same tables and indexes as the local file, created only if they're missing.
const schema = (await local.execute("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC")).rows;
for (const { sql } of schema) {
  await remote.execute(String(sql).replace(/^CREATE (TABLE|INDEX) (?!IF NOT EXISTS)/i, "CREATE $1 IF NOT EXISTS "));
}
// Columns added in later versions (a fresh remote table created by the app may lack them).
for (const sql of [
  "ALTER TABLE fb_posts ADD COLUMN video_id TEXT",
  "ALTER TABLE repos ADD COLUMN rising_at INTEGER",
  "ALTER TABLE repos ADD COLUMN facets TEXT",
  "ALTER TABLE repos ADD COLUMN worked INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE repos ADD COLUMN stuck INTEGER NOT NULL DEFAULT 0",
])
  await remote.execute(sql).catch(() => {});

const BATCH = 20;
for (const { name } of schema.filter((s) => s.type === "table")) {
  const { rows, columns } = await local.execute(`SELECT * FROM ${name}`);
  // votes has no primary key, so replace them wholesale rather than duplicating on a re-run.
  if (name === "votes") await remote.execute("DELETE FROM votes");
  const insert = `INSERT OR REPLACE INTO ${name} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  for (let i = 0; i < rows.length; i += BATCH) {
    await remote.batch(
      rows.slice(i, i + BATCH).map((r) => ({ sql: insert, args: columns.map((c) => r[c] ?? null) })),
      "write",
    );
    process.stdout.write(`\r${name}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log(rows.length ? "" : `${name}: 0/0`);
}

const check = await Promise.all(["repos", "votes", "guides", "fb_posts"].map(async (t) => `${t} ${(await remote.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n}`));
console.log(`Done. In Turso now: ${check.join(", ")}`);
