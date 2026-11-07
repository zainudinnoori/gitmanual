import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieOptions, fresh, githubApp, open, seal, SESSION_COOKIE } from "@/lib/session";

export type MyRepo = { fullName: string; description: string | null; private: boolean; pushedAt: string };

const MAX_REPOS = 300;

// For the Private repos page: is GitHub connected in this browser, as whom, and which repos it may read (every
// account or organization the visitor installed the app on). Asks GitHub each time, so changes made there show
// here, and a connection removed there shows as disconnected.
export async function GET() {
  const app = githubApp();
  const headers = { "Cache-Control": "private, no-store" };
  const session = app ? open((await cookies()).get(SESSION_COOKIE)?.value) : null;
  const connected = app && session ? await fresh(app, session) : null;
  if (!connected) return NextResponse.json({ app: Boolean(app), login: null, repos: [] }, { headers });

  const gh = async <T,>(path: string): Promise<{ status: number; data: T | null }> => {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "gitmanual", Authorization: `Bearer ${connected.session.token}` },
      cache: "no-store",
    }).catch(() => null);
    return { status: res?.status ?? 0, data: res?.ok ? ((await res.json()) as T) : null };
  };

  const user = await gh<{ login: string }>("/user");
  if (!user.data) {
    const out = NextResponse.json({ app: true, login: null, repos: [] }, { headers });
    if (user.status === 401) out.cookies.delete({ name: SESSION_COOKIE, path: "/api" });
    return out;
  }

  const repos: MyRepo[] = [];
  const installs = (await gh<{ installations: { id: number }[] }>("/user/installations?per_page=100")).data?.installations ?? [];
  for (const { id } of installs) {
    for (let page = 1; page <= 3 && repos.length < MAX_REPOS; page++) {
      const r = (await gh<{ repositories: any[] }>(`/user/installations/${id}/repositories?per_page=100&page=${page}`)).data?.repositories ?? [];
      repos.push(...r.map((x) => ({ fullName: x.full_name, description: x.description, private: Boolean(x.private), pushedAt: x.pushed_at })));
      if (r.length < 100) break;
    }
  }
  repos.sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt)); // most recently worked on first

  const out = NextResponse.json({ app: true, login: user.data.login, repos: repos.slice(0, MAX_REPOS) }, { headers });
  if (connected.renewed) out.cookies.set(SESSION_COOKIE, seal(connected.session), cookieOptions());
  return out;
}
