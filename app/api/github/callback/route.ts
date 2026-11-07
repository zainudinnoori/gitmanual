import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieOptions, exchangeCode, githubApp, safeBack, seal, SESSION_COOKIE, STATE_COOKIE } from "@/lib/session";

// GitHub comes back here after the visitor installs the app or changes its repos (the app's Callback and Setup URL).
// Installing also signs them in (a code to trade for their access); changing repos doesn't, so that goes through
// GitHub's sign-in, which returns straight away for someone who already said yes.
export async function GET(req: Request) {
  const app = githubApp();
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const [expected, back] = (jar.get(STATE_COOKIE)?.value ?? "").split("|");
  const home = (msg?: string) => NextResponse.redirect(new URL(`${safeBack(back)}${msg ? `${safeBack(back).includes("?") ? "&" : "?"}github=${msg}` : ""}`, req.url));
  if (!app) return home();
  // Only answers to a connect started in this browser count.
  if (!expected || q.get("state") !== expected) return home("expired");

  const code = q.get("code");
  if (!code) {
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", app.clientId);
    authorize.searchParams.set("state", expected);
    return NextResponse.redirect(authorize);
  }

  try {
    const session = await exchangeCode(app, code);
    const res = home();
    res.cookies.set(SESSION_COOKIE, seal(session), cookieOptions());
    res.cookies.delete({ name: STATE_COOKIE, path: "/api" });
    return res;
  } catch {
    return home("failed");
  }
}
