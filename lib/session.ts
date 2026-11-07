import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Private repos: a visitor connects the gitmanual GitHub App (read-only access to the repos they pick), and their
// access is kept in an encrypted, http-only cookie in their own browser, never in the database. The cookie only
// goes to /api, and the key (SESSION_SECRET) never leaves the server.

export const SESSION_COOKIE = "gm_github";
export const STATE_COOKIE = "gm_github_state";
const MAX_AGE = 30 * 24 * 60 * 60; // seconds; GitHub's refresh tokens last six months

export type GitHubApp = { slug: string; clientId: string; clientSecret: string };

// Set up when all four settings are there (see .env.example); without them, only the token option shows.
export function githubApp(): GitHubApp | null {
  const { GITHUB_APP_SLUG: slug, GITHUB_APP_CLIENT_ID: clientId, GITHUB_APP_CLIENT_SECRET: clientSecret, SESSION_SECRET } = process.env;
  return slug && clientId && clientSecret && SESSION_SECRET ? { slug, clientId, clientSecret } : null;
}

type Session = { token: string; refresh?: string; expiresAt?: number }; // expiresAt in ms

const key = () => createHash("sha256").update(`gitmanual-session|${process.env.SESSION_SECRET}`).digest();

// AES-256-GCM: unreadable without the key, and any change to the cookie makes it fail to open.
export function seal(s: Session): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(s), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

export function open(value: string | undefined): Session | null {
  if (!value || !process.env.SESSION_SECRET) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAge = MAX_AGE) =>
  ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api", maxAge }) as const;

// Trades the code GitHub sends back (or a refresh token) for a user access token.
async function tokenRequest(app: GitHubApp, params: Record<string, string>): Promise<Session> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "gitmanual" },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, ...params }),
    cache: "no-store",
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!t.access_token) throw new Error(t.error ?? `GitHub answered ${res.status}`);
  return { token: t.access_token, refresh: t.refresh_token, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined };
}

export const exchangeCode = (app: GitHubApp, code: string) => tokenRequest(app, { code });

// User tokens expire after 8 hours; a session close to that is renewed first. Returns the session to keep using
// and whether the cookie has to be rewritten, or null when it can't be renewed (the visitor connects again).
export async function fresh(app: GitHubApp, s: Session): Promise<{ session: Session; renewed: boolean } | null> {
  if (!s.expiresAt || s.expiresAt - Date.now() > 60_000) return { session: s, renewed: false };
  if (!s.refresh) return null;
  try {
    return { session: await tokenRequest(app, { grant_type: "refresh_token", refresh_token: s.refresh }), renewed: true };
  } catch {
    return null;
  }
}

// Only paths on this site, so the round trip through GitHub can't be used to send someone elsewhere.
export const safeBack = (back: string | null | undefined) => (back && /^\/(?!\/)[^\s\\]*$/.test(back) ? back : "/");
