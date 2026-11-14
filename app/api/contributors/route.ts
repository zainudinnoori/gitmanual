import { NextResponse } from "next/server";
import { hasRepo, repoKey } from "@/lib/db";
import { getContributors, parseRepoUrl } from "@/lib/github";

// Top contributors for a manual's sidebar. Only for repos already on gitmanual, so it can't be used to spend the
// site's GitHub allowance on anything else, and kept by the CDN for a day: one GitHub call per repo per day at most.
export async function GET(req: Request) {
  const ref = parseRepoUrl(new URL(req.url).searchParams.get("repo") ?? "");
  if (!ref || ref.ref) return NextResponse.json({ error: "Expected ?repo=owner/name" }, { status: 400 });
  if (!(await hasRepo(repoKey(ref.owner, ref.repo)))) return NextResponse.json({ contributors: [] }, { status: 404 });
  const contributors = await getContributors(ref).catch(() => null);
  return NextResponse.json(
    { contributors: contributors ?? [] },
    // A GitHub hiccup is kept only briefly, so the list comes back on the next try.
    { headers: { "Cache-Control": contributors ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300" } },
  );
}
