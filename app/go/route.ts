import { NextResponse } from "next/server";
import { parseRepoUrl } from "@/lib/github";

// Old links used /?url=<GitHub link> (next.config sends them here), so the homepage itself can be cached.
export function GET(req: Request) {
  const url = new URL(req.url);
  const ref = parseRepoUrl(url.searchParams.get("url") ?? "");
  const to = ref ? `/${ref.owner}/${ref.repo}${ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : ""}` : "/";
  return NextResponse.redirect(new URL(to, url), 308);
}
