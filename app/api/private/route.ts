import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GitHubError, parseRepoUrl } from "@/lib/github";
import { limit, LimitError, limitHeaders, visitor } from "@/lib/limit";
import { loadPrivate } from "@/lib/pipeline";
import { cookieOptions, fresh, githubApp, open, seal, SESSION_COOKIE } from "@/lib/session";

// The manual for a private repo, read with the visitor's own GitHub access: a token they pasted (kept in their
// browser, sent as X-GitHub-Token) or the connected GitHub App (the encrypted cookie). The answer is built for this
// one request: nothing is saved, logged or cached on the way.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const ref = url ? parseRepoUrl(url) : null;
  if (!ref) return NextResponse.json({ error: "Enter a GitHub URL like github.com/owner/repo" }, { status: 400, headers: NO_STORE });

  const app = githubApp();
  const jar = await cookies();
  const pasted = req.headers.get("x-github-token")?.trim();
  const session = pasted || !app ? null : open(jar.get(SESSION_COOKIE)?.value);
  const connected = session && app ? await fresh(app, session) : null;
  const token = pasted || connected?.session.token;
  if (!token) {
    return NextResponse.json({ error: "Connect GitHub or add a token to open private repos.", connect: true, app: Boolean(app) }, { status: 401, headers: NO_STORE });
  }

  try {
    // GitHub's own limits apply to the visitor's access; this one stops the site being used as a free proxy.
    await limit("analyze", visitor(req.headers));
    const { data, analyzedAt } = await loadPrivate(ref, token);
    const res = NextResponse.json(
      { ...data, analyzedAt, cached: false, votes: { worked: 0, stuck: 0, byOs: {} }, via: pasted ? "token" : "app" },
      { headers: NO_STORE },
    );
    if (connected?.renewed) res.cookies.set(SESSION_COOKIE, seal(connected.session), cookieOptions());
    return res;
  } catch (err) {
    if (err instanceof LimitError) return NextResponse.json({ error: err.message }, { status: 429, headers: { ...NO_STORE, ...limitHeaders(err) } });
    if (err instanceof GitHubError) {
      const res = NextResponse.json({ error: err.message, connect: err.status === 401, app: Boolean(app), via: pasted ? "token" : "app" }, { status: err.status, headers: NO_STORE });
      // An app sign-in GitHub no longer accepts is forgotten, so the page offers to connect again.
      if (err.status === 401 && !pasted) res.cookies.delete({ name: SESSION_COOKIE, path: "/api" });
      return res;
    }
    console.error("private repo failed");
    return NextResponse.json({ error: "Failed to analyze repository." }, { status: 500, headers: NO_STORE });
  }
}
