import type { NextResponse } from "next/server";
import { AD_FREE_COOKIE } from "./site";
import { GRACE_MS } from "./stripe";

// No ads for Pro. Manual pages are cached and shared, so the server can't leave the ad out for one person; instead
// this cookie tells the browser. It's set whenever the site confirms Pro (/api/pro, sign-in) and lasts until the paid
// period ends plus the grace days, and it's removed once Pro is gone or the visitor signs out. Not a secret: setting
// it by hand only hides ads in that one browser, which an ad blocker does anyway.
export function markAdFree(res: NextResponse, pro: boolean, periodEnd?: number | null): NextResponse {
  const until = (periodEnd ?? 0) + GRACE_MS - Date.now();
  if (pro && until > 0) {
    res.cookies.set(AD_FREE_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: Math.floor(until / 1000),
    });
  } else res.cookies.delete({ name: AD_FREE_COOKIE, path: "/" });
  return res;
}
