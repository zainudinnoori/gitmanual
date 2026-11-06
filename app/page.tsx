import { redirect } from "next/navigation";
import { countRising, listRepos } from "@/lib/db";
import { parseRepoUrl } from "@/lib/github";
import { Landing } from "./hero";

export default async function Home({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  // Old links used /?url=…; send them to the repo's own page.
  const { url } = await searchParams;
  const ref = url ? parseRepoUrl(url) : null;
  if (ref) redirect(`/${ref.owner}/${ref.repo}${ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : ""}`);
  const [recent, popular, rising, risingTotal] = await Promise.all([
    listRepos("recent", 12),
    listRepos("popular", 12),
    listRepos("rising"),
    countRising(),
  ]);
  // A repo shows in one place: "Rising this week" keeps its own, and the shelf section fills up with others.
  const shown = new Set(rising.map((r) => r.fullName));
  const others = (list: typeof recent) => list.filter((r) => !shown.has(r.fullName)).slice(0, 6);
  return <Landing recent={others(recent)} popular={others(popular)} rising={rising} risingTotal={risingTotal} />;
}
