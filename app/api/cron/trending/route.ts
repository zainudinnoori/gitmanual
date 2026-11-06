import { NextResponse } from "next/server";
import { getCached, repoKey } from "@/lib/db";
import { risingRepos } from "@/lib/github";
import { loadRepo } from "@/lib/pipeline";

export const maxDuration = 300;

// New repos per run: about 4 GitHub API calls each, well inside the 5,000/hour token, and done in a few minutes.
const PER_RUN = 15;

// Daily (vercel.json): adds manuals for repos that are rising on GitHub right now, so the shelf, the sitemap and
// search engines get them while people are searching for them. Repos already on the shelf are left alone.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/trending
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  let candidates: string[];
  try {
    candidates = await risingRepos(40);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const added: string[] = [];
  const failed: { repo: string; error: string }[] = [];
  let known = 0;
  for (const full of candidates) {
    if (added.length >= PER_RUN || Date.now() - started > 240_000) break; // leave room before the time limit
    if (await getCached(repoKey(...(full.split("/") as [string, string])))) {
      known++;
      continue;
    }
    const [owner, repo] = full.split("/");
    try {
      await loadRepo({ owner, repo });
      added.push(full);
    } catch (e) {
      failed.push({ repo: full, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ candidates: candidates.length, known, added, failed });
}
