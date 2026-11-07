import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookieOptions, githubApp, safeBack, STATE_COOKIE } from "@/lib/session";

// "Connect GitHub": installing the gitmanual GitHub App, where the visitor picks the repos it can read. GitHub then
// sends them to /api/github/callback. The state cookie ties that answer to this browser and remembers the page to go back to.
//   /api/github/connect?back=/owner/repo
export async function GET(req: Request) {
  const app = githubApp();
  const back = safeBack(new URL(req.url).searchParams.get("back"));
  if (!app) return NextResponse.redirect(new URL(back, req.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(`https://github.com/apps/${app.slug}/installations/new?state=${state}`);
  res.cookies.set(STATE_COOKIE, `${state}|${back}`, cookieOptions(10 * 60));
  return res;
}
