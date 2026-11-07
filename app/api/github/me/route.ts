import { NextResponse } from "next/server";
import { githubApp } from "@/lib/session";
import { viewer } from "@/lib/viewer";

export type MyRepo = { fullName: string; description: string | null; private: boolean; pushedAt: string };

const MAX_REPOS = 300;

// For the Private repos page: is GitHub connected in this browser, as whom, and which repos it may read (every
// account or organization the visitor installed the app on). Asks GitHub each time, so changes made there show
// here, and a connection removed there shows as disconnected.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const { user, settle } = await viewer();
  if (!user) return settle(NextResponse.json({ app: Boolean(githubApp()), login: null, repos: [] }, { headers }));

  const gh = async <T,>(path: string): Promise<T | null> => {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "gitmanual", Authorization: `Bearer ${user.token}` },
      cache: "no-store",
    }).catch(() => null);
    return res?.ok ? ((await res.json()) as T) : null;
  };

  const repos: MyRepo[] = [];
  const installs = (await gh<{ installations: { id: number }[] }>("/user/installations?per_page=100"))?.installations ?? [];
  for (const { id } of installs) {
    for (let page = 1; page <= 3 && repos.length < MAX_REPOS; page++) {
      const r = (await gh<{ repositories: any[] }>(`/user/installations/${id}/repositories?per_page=100&page=${page}`))?.repositories ?? [];
      repos.push(...r.map((x) => ({ fullName: x.full_name, description: x.description, private: Boolean(x.private), pushedAt: x.pushed_at })));
      if (r.length < 100) break;
    }
  }
  repos.sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt)); // most recently worked on first

  return settle(NextResponse.json({ app: true, login: user.login, repos: repos.slice(0, MAX_REPOS) }, { headers }));
}
