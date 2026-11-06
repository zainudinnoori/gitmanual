import { GitHubError } from "@/lib/github";
import { compactCount } from "@/lib/format";
import { fitCheck } from "@/lib/fit";
import { posterImage } from "@/lib/og";
import { OS_LIST } from "@/lib/os";
import { analyzeGate } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";

const LABEL = { mac: "macOS", windows: "Windows", linux: "Linux" } as const;
const TIME: Record<string, string> = { Easy: "~5 min", Moderate: "~15 min", Involved: "30+ min" };


// A 1080×1080 poster for social posts. ?download=1 saves it as a file.
export async function GET(req: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  let loaded;
  try {
    loaded = await loadRepo({ owner, repo }, { gate: analyzeGate(req.headers) });
  } catch (e) {
    return new Response(e instanceof GitHubError ? e.message : "Couldn't load the repository.", { status: e instanceof GitHubError ? e.status : 500 });
  }
  const { meta, analysis, install } = loaded.data;
  const [o, n] = meta.fullName.split("/");
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").host;
  const image = await posterImage({
    owner: o,
    name: n,
    description: meta.description?.replace(/:[a-z0-9_+-]+:\s*/g, "") ?? null,
    stars: compactCount(meta.stars),
    difficulty: analysis.difficulty.label,
    time: TIME[analysis.difficulty.label] ?? "",
    // Chip is unknown here, so the verdict is the system-level one.
    fit: OS_LIST.map((os) => ({ label: LABEL[os], mark: fitCheck(analysis, install, os, null, meta.archived).status })),
    url: `${site}/${meta.fullName}`,
  });
  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  if (new URL(req.url).searchParams.has("download")) headers.set("Content-Disposition", `attachment; filename="${n}-gitmanual-poster.png"`);
  return new Response(image.body, { status: image.status, headers });
}
