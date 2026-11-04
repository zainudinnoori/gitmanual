import { NextResponse } from "next/server";
import { addVote, getVotes, repoKey } from "@/lib/db";
import { parseRepoUrl } from "@/lib/github";
import { OS_LIST, type OS } from "@/lib/os";

// "Did it work for you?" — one vote per browser is enforced on the client.
export async function POST(req: Request) {
  const { repo, os, worked } = (await req.json().catch(() => ({}))) as { repo?: string; os?: OS; worked?: boolean };
  const ref = repo ? parseRepoUrl(repo) : null;
  if (!ref || !os || !OS_LIST.includes(os) || typeof worked !== "boolean") {
    return NextResponse.json({ error: "Expected { repo, os, worked }" }, { status: 400 });
  }
  const key = repoKey(ref.owner, ref.repo, ref.ref);
  await addVote(key, os, worked);
  return NextResponse.json({ votes: await getVotes(key) });
}
