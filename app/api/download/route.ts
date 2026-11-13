import { NextResponse } from "next/server";
import { countInterest } from "@/lib/db";
import { manualFile } from "@/lib/download";
import { GitHubError } from "@/lib/github";
import { firstTime, visitor } from "@/lib/limit";
import { OS_LIST, OS_SLUG, type OS } from "@/lib/os";
import { isPro } from "@/lib/pro";
import { proUrl } from "@/lib/site";
import { PRO_ENABLED } from "@/lib/stripe";
import { viewer } from "@/lib/viewer";

// A public repo's manual for one system as a file (the "Download manual" menu on manual pages):
//   GET /api/download?repo=owner/name&os=mac&format=pdf   PDF
//   GET /api/download?repo=owner/name&os=mac&format=md    Markdown
// Both are GitManual Pro: signed-out visitors are sent to sign in, others to /pro.
// Under /api so the GitHub sign-in cookie comes along. Downloads are counted per repo and day, like the demand test.
export const maxDuration = 60;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const repo = q.get("repo") ?? "";
  const os = q.get("os") as OS;
  const format = q.get("format");
  if (!/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repo) || !OS_LIST.includes(os) || (format !== "md" && format !== "pdf"))
    return NextResponse.json({ error: "Expected ?repo=owner/name&os=mac|windows|linux&format=md|pdf" }, { status: 400 });

  const back = `/${repo}/${OS_SLUG[os]}`;
  if (!PRO_ENABLED()) return NextResponse.json({ error: "Downloading manuals is coming soon." }, { status: 404 });
  const v = await viewer();
  const settle = v.settle;
  if (!v.user) return NextResponse.redirect(new URL(`/api/github/connect?signin=1&back=${encodeURIComponent(`${back}#pdf`)}`, req.url));
  if (!(await isPro(v.user.id))) return settle(NextResponse.redirect(new URL(`${proUrl(`${back}#pdf`)}&from=${format}`, req.url)));

  try {
    const file = await manualFile(repo, os, format, req.headers);
    const feature = format === "pdf" ? "pdf-download" : "md-download";
    if (await firstTime(`interest:${feature}:${repo.toLowerCase()}`, visitor(req.headers))) await countInterest(feature, repo);
    return settle(
      new NextResponse(file.body as BodyInit, {
        headers: {
          "Content-Type": file.type,
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Cache-Control": "private, no-store",
        },
      }),
    );
  } catch (e) {
    if (e instanceof GitHubError) return NextResponse.json({ error: e.message }, { status: e.status === 404 ? 404 : e.status });
    console.error("gitmanual download:", e);
    return NextResponse.json({ error: "Couldn't make the file. Try again later." }, { status: 500 });
  }
}
