import { GitHubError } from "@/lib/github";
import { LimitError, limitHeaders } from "@/lib/limit";
import { lookupManual, parseArch, parseOs } from "@/lib/lookup";
import { manualMarkdown } from "@/lib/manual";

// A manual's facts for scripts and AI agents:
//   GET /api/v1/manual?repo=ollama/ollama            all systems, JSON
//   GET /api/v1/manual?repo=ollama/ollama&os=mac&arch=arm64&format=md
const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const repo = q.get("repo");
  if (!repo) return Response.json({ error: "Add ?repo=owner/repo" }, { status: 400, headers: CORS });
  try {
    const facts = await lookupManual(repo, { os: parseOs(q.get("os")), arch: parseArch(q.get("arch")), headers: req.headers });
    const cache = { "Cache-Control": "public, max-age=3600, s-maxage=3600", ...CORS };
    return q.get("format") === "md"
      ? new Response(manualMarkdown(facts), { headers: { "Content-Type": "text/markdown; charset=utf-8", ...cache } })
      : Response.json(facts, { headers: cache });
  } catch (e) {
    if (e instanceof LimitError) return Response.json({ error: e.message }, { status: 429, headers: { ...CORS, ...limitHeaders(e) } });
    if (e instanceof GitHubError) return Response.json({ error: e.message }, { status: e.status, headers: CORS });
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't load the repository." }, { status: 400, headers: CORS });
  }
}
