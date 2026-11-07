import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { cookieOptions, fresh, githubApp, open, seal, SESSION_COOKIE } from "./session";

// The visitor's GitHub sign-in (the encrypted cookie from lib/session.ts), checked with GitHub: who they are and
// the token to act for them. `settle` writes back a renewed sign-in, or forgets one GitHub no longer accepts.
export type Viewer = { id: number; login: string; token: string };

export async function viewer(): Promise<{ user: Viewer | null; settle: (res: NextResponse) => NextResponse }> {
  const app = githubApp();
  const session = app ? open((await cookies()).get(SESSION_COOKIE)?.value) : null;
  const connected = app && session ? await fresh(app, session) : null;
  if (!connected) return { user: null, settle: (res) => res };

  const res = await fetch("https://api.github.com/user", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "gitmanual", Authorization: `Bearer ${connected.session.token}` },
    cache: "no-store",
  }).catch(() => null);
  const u = res?.ok ? ((await res.json()) as { id: number; login: string }) : null;
  const settle = (out: NextResponse) => {
    if (!u && res?.status === 401) out.cookies.delete({ name: SESSION_COOKIE, path: "/api" });
    else if (connected.renewed) out.cookies.set(SESSION_COOKIE, seal(connected.session), cookieOptions());
    return out;
  };
  return { user: u ? { id: u.id, login: u.login, token: connected.session.token } : null, settle };
}

// Site admins (the API key list), by GitHub username: ADMIN_GITHUB_LOGINS=you,teammate
export const isAdmin = (login: string) =>
  (process.env.ADMIN_GITHUB_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(login.toLowerCase());
