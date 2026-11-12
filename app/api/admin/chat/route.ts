import { NextResponse } from "next/server";
import { chatStats } from "@/lib/budget";
import { interestStats } from "@/lib/db";
import { isAdmin, viewer } from "@/lib/viewer";

// For site admins (ADMIN_GITHUB_LOGINS): chat use and spend (lib/budget.ts chatStats), with the GitHub logins of
// people who used all their answers. Accounts are stored as GitHub user ids, so those few are looked up.
const NO_STORE = { "Cache-Control": "private, no-store" };

async function login(id: string): Promise<string | null> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "gitmanual" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/user/${encodeURIComponent(id)}`, { headers, next: { revalidate: 86400 } }).catch(() => null);
  return r?.ok ? (((await r.json()) as { login?: string }).login ?? null) : null;
}

export async function GET() {
  const { user } = await viewer();
  if (!user || !isAdmin(user.login)) return NextResponse.json({ error: "Admins only." }, { status: 403, headers: NO_STORE });
  try {
    const [stats, pdfInterest] = await Promise.all([chatStats(), interestStats("pdf")]);
    const ids = [...new Set(stats.atLimit.map((a) => a.account))].slice(0, 30);
    const logins = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await login(id)] as const)));
    return NextResponse.json({ ...stats, logins, pdfInterest }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "The database isn't reachable right now." }, { status: 503, headers: NO_STORE });
  }
}
