import { NextResponse } from "next/server";
import { FINDS_PAGE, pagePicks, parseTab } from "@/lib/picks";

// The next page of the /finds feed, for loading more on scroll.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const offset = Math.max(0, Number(q.get("offset")) || 0);
  const { picks, next } = await pagePicks(parseTab(q.get("tab")), offset, FINDS_PAGE);
  return NextResponse.json({ picks, next }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
