import { NextResponse } from "next/server";
import { newKey } from "@/lib/apikeys";
import { deleteKey, keyForUser, saveKey } from "@/lib/db";
import { githubApp } from "@/lib/session";
import { viewer } from "@/lib/viewer";

// The signed-in visitor's API key (/developers): see it (GET), make or replace it (POST; the key is in this one
// answer and never again), or delete it (DELETE). One key per GitHub account.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { user, settle } = await viewer();
  if (!user) return settle(NextResponse.json({ app: Boolean(githubApp()), login: null, key: null }, { headers: NO_STORE }));
  const k = await keyForUser(user.id);
  return settle(
    NextResponse.json(
      { app: true, login: user.login, key: k && { prefix: k.prefix, createdAt: k.createdAt, lastUsed: k.lastUsed, uses: k.uses, blocked: k.blocked } },
      { headers: NO_STORE },
    ),
  );
}

export async function POST() {
  const { user, settle } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in with GitHub first." }, { status: 401, headers: NO_STORE });
  const { key, hash, prefix } = newKey();
  if (!(await saveKey({ hash, prefix, githubId: user.id, login: user.login }))) {
    return settle(NextResponse.json({ error: "Couldn't make a key for this account. Get in touch through the contact page." }, { status: 403, headers: NO_STORE }));
  }
  return settle(NextResponse.json({ key, prefix }, { headers: NO_STORE }));
}

export async function DELETE() {
  const { user, settle } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in with GitHub first." }, { status: 401, headers: NO_STORE });
  await deleteKey(user.id);
  return settle(NextResponse.json({ ok: true }, { headers: NO_STORE }));
}
