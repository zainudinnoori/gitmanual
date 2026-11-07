import { getCached, repoKey } from "@/lib/db";
import { compactCount } from "@/lib/format";
import { ogImage, OG_SIZE } from "@/lib/og";
import { OS_LABEL } from "@/lib/os";
import type { RepoData } from "@/lib/pipeline";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Setup manual on gitmanual";


// Cached for a day by browsers and Vercel's CDN: link previews and crawlers fetch this often, and drawing the PNG
// takes a second or more. A day old is fine for stars and a description.
const CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export default async function Image(props: { params: Promise<{ owner: string; repo: string }> }) {
  const res = await draw(props);
  res.headers.set("Cache-Control", CACHE);
  return res;
}

// Uses the saved manual only, so a share preview never triggers a fresh GitHub analysis.
async function draw({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  const saved = await getCached(repoKey(owner, repo));
  const data = saved?.data as RepoData | undefined;
  if (!data?.meta) return ogImage({ eyebrow: "Setup manual", owner, title: repo, text: "How to set it up on macOS, Windows and Linux." });
  const { meta, analysis, install } = data;
  return ogImage({
    eyebrow: "Setup manual",
    owner: meta.fullName.split("/")[0],
    title: meta.fullName.split("/")[1],
    text: meta.description?.replace(/:[a-z0-9_+-]+:\s*/g, "") ?? "How to set it up on macOS, Windows and Linux.",
    chips: [
      `${compactCount(meta.stars)} stars`,
      `${analysis.difficulty.label} setup`,
      ...(install.platforms.length ? [install.platforms.length === 3 ? "Mac, Windows, Linux" : `For ${install.platforms.map((p) => OS_LABEL[p]).join(" + ")}`] : []),
    ],
  });
}
