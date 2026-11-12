import { NextResponse } from "next/server";
import { listUsers } from "@/lib/db";
import { isAdmin, viewer } from "@/lib/viewer";

// For site admins (ADMIN_GITHUB_LOGINS): everyone who signed in with GitHub, and their recent chat use.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { user } = await viewer();
  if (!user || !isAdmin(user.login)) return NextResponse.json({ error: "Admins only." }, { status: 403, headers: NO_STORE });
  try {
    return NextResponse.json({ users: await listUsers() }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "The database isn't reachable right now." }, { status: 503, headers: NO_STORE });
  }
}
