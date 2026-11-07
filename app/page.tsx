import { redirect } from "next/navigation";
import { countRising, facetCounts, listRepos } from "@/lib/db";
import { parseRepoUrl } from "@/lib/github";
import { LISTS, MIN_LIST } from "@/lib/lists";
import { OS_LIST } from "@/lib/os";
import { Landing, type SystemLists } from "./hero";

export default async function Home({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  // Old links used /?url=…; send them to the repo's own page.
  const { url } = await searchParams;
  const ref = url ? parseRepoUrl(url) : null;
  if (ref) redirect(`/${ref.owner}/${ref.repo}${ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : ""}`);
  const [recent, popular, rising, risingTotal, counts] = await Promise.all([
    listRepos("recent", 12),
    listRepos("popular", 12),
    listRepos("rising"),
    countRising(),
    facetCounts([...OS_LIST.map((os) => ({ all: [`os:${os}`] })), ...LISTS]),
  ]);
  // One card per system: how many repos run on it, and its lists that have enough in them to show.
  const systems: SystemLists[] = OS_LIST.map((os, i) => ({
    os,
    total: counts[i],
    lists: LISTS.map((l, j) => ({ slug: l.slug, theme: l.theme, short: l.short, os: l.os, count: counts[OS_LIST.length + j] })).filter(
      (l) => l.os === os && l.count >= MIN_LIST,
    ),
  })).filter((s) => s.lists.length > 0);
  // A repo shows in one place: "Rising this week" keeps its own, and the shelf section fills up with others.
  const shown = new Set(rising.map((r) => r.fullName));
  const others = (list: typeof recent) => list.filter((r) => !shown.has(r.fullName)).slice(0, 6);
  return (
    <Landing
      recent={others(recent)}
      popular={others(popular)}
      rising={rising}
      risingTotal={risingTotal}
      systems={systems}
      extension={process.env.NEXT_CHROME_EXTENSION_URL || null}
    />
  );
}
