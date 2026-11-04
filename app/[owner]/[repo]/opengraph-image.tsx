import { getCached, repoKey } from "@/lib/db";
import { ogImage, OG_SIZE } from "@/lib/og";
import { OS_LABEL } from "@/lib/os";
import type { RepoData } from "@/lib/pipeline";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Setup manual on gitmanual";

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
}

// Uses the saved manual only, so a share preview never triggers a fresh GitHub analysis.
export default async function Image({ params }: { params: Promise<{ owner: string; repo: string }> }) {
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
      `${compact(meta.stars)} stars`,
      `${analysis.difficulty.label} setup`,
      ...(install.platforms.length ? [install.platforms.length === 3 ? "Mac, Windows, Linux" : `For ${install.platforms.map((p) => OS_LABEL[p]).join(" + ")}`] : []),
    ],
  });
}
