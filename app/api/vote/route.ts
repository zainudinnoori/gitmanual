import { NextResponse } from "next/server";
import { addVote, getVotes, repoKey } from "@/lib/db";
import { parseRepoUrl } from "@/lib/github";
import { firstTime, limit, LimitError, limitHeaders, visitor } from "@/lib/limit";
import { OS_LIST, type OS } from "@/lib/os";

// "Did it work for you?" The browser keeps one vote per repo; here, a visitor counts once per repo and system a day.
export async function POST(req: Request) {
  const { repo, os, worked } = (await req.json().catch(() => ({}))) as { repo?: string; os?: OS; worked?: boolean };
  const ref = repo ? parseRepoUrl(repo) : null;
  if (!ref || !os || !OS_LIST.includes(os) || typeof worked !== "boolean") {
    return NextResponse.json({ error: "Expected { repo, os, worked }" }, { status: 400 });
  }
  const key = repoKey(ref.owner, ref.repo, ref.ref);
  const who = visitor(req.headers);
  try {
    await limit("vote", who);
  } catch (e) {
    if (e instanceof LimitError) return NextResponse.json({ error: e.message }, { status: 429, headers: limitHeaders(e) });
    throw e;
  }
  // A repeat vote gets the same answer as a new one, without counting again.
  if (await firstTime(`voted:${key}:${os}`, who)) await addVote(key, os, worked);
  return NextResponse.json({ votes: await getVotes(key) });
}
