import { NextResponse } from "next/server";
import { syncFacebook } from "@/lib/facebook";

export const maxDuration = 300;

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET". Run it by hand the same way:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/facebook
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // ?images=1 re-downloads the images of posts already saved.
    return NextResponse.json(await syncFacebook({ images: new URL(req.url).searchParams.has("images") }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
