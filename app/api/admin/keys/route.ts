import { NextResponse } from "next/server";
import { blockKey, listKeys } from "@/lib/db";
import { isAdmin, viewer } from "@/lib/viewer";

// For site admins (ADMIN_GITHUB_LOGINS): every API key's owner and use, and turning a key off or back on.
const NO_STORE = { "Cache-Control": "private, no-store" };

async function admin() {
  const { user } = await viewer();
  return user && isAdmin(user.login) ? user : null;
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Admins only." }, { status: 403, headers: NO_STORE });
  return NextResponse.json({ keys: await listKeys() }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Admins only." }, { status: 403, headers: NO_STORE });
  const { githubId, blocked } = (await req.json().catch(() => ({}))) as { githubId?: number; blocked?: boolean };
  if (typeof githubId !== "number" || typeof blocked !== "boolean") return NextResponse.json({ error: "Send githubId and blocked." }, { status: 400, headers: NO_STORE });
  await blockKey(githubId, blocked);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
