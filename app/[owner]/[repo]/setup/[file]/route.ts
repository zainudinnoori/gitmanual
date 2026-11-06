import { GitHubError } from "@/lib/github";
import type { OS } from "@/lib/os";
import { analyzeGate } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";
import { buildScript } from "@/lib/script";

const FILES: Record<string, OS> = { "mac.sh": "mac", "linux.sh": "linux", "windows.ps1": "windows" };

// The manual's steps as one script: /owner/repo/setup/mac.sh, linux.sh or windows.ps1. Shown as text so it can be
// read in the browser first; ?download=1 saves it as setup.sh / setup.ps1.
export async function GET(req: Request, { params }: { params: Promise<{ owner: string; repo: string; file: string }> }) {
  const { owner, repo, file } = await params;
  const os = FILES[file];
  if (!os) return new Response("Use mac.sh, linux.sh or windows.ps1.", { status: 404 });
  let loaded;
  try {
    loaded = await loadRepo({ owner, repo }, { gate: analyzeGate(req.headers) });
  } catch (e) {
    return new Response(e instanceof GitHubError ? e.message : "Couldn't load the repository.", { status: e instanceof GitHubError ? e.status : 500 });
  }
  const { meta, analysis } = loaded.data;
  const script = buildScript(analysis.steps[os], os, meta.fullName, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=43200" });
  if (new URL(req.url).searchParams.has("download")) headers.set("Content-Disposition", `attachment; filename="${script.filename}"`);
  // Windows PowerShell 5.1 reads a .ps1 without a byte-order mark as ANSI, garbling "·" and "—"; the mark fixes that.
  return new Response(os === "windows" ? `\uFEFF${script.text}` : script.text, { headers });
}
