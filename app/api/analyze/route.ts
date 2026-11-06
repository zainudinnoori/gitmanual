import { NextResponse } from "next/server";
import { getVotes } from "@/lib/db";
import { GitHubError, parseRepoUrl } from "@/lib/github";
import { analyzeGate, LimitError, limitHeaders } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";

export async function POST(req: Request) {
  const { url, fresh } = (await req.json().catch(() => ({}))) as { url?: string; fresh?: boolean };
  const ref = url ? parseRepoUrl(url) : null;
  if (!ref) return NextResponse.json({ error: "Enter a GitHub URL like github.com/owner/repo" }, { status: 400 });

  try {
    const { key, data, analyzedAt, cached, stale } = await loadRepo(ref, { fresh, view: true, gate: analyzeGate(req.headers) });
    return NextResponse.json({ ...data, analyzedAt, cached, stale, votes: await getVotes(key) });
  } catch (err) {
    if (err instanceof LimitError) return NextResponse.json({ error: err.message }, { status: 429, headers: limitHeaders(err) });
    if (err instanceof GitHubError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Failed to analyze repository." }, { status: 500 });
  }
}
