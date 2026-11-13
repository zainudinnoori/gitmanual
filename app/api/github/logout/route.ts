import { NextResponse } from "next/server";
import { AD_FREE_COOKIE } from "@/lib/site";
import { SESSION_COOKIE } from "@/lib/session";

// "Disconnect": forgets the visitor's GitHub access in this browser. Removing the app itself is on GitHub
// (Settings → Applications), which the page links to.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/api" });
  res.cookies.delete({ name: AD_FREE_COOKIE, path: "/" });
  return res;
}
