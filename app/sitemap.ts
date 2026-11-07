import type { MetadataRoute } from "next";
import { sitemapRepos } from "@/lib/db";
import { OS_LIST, OS_SLUG } from "@/lib/os";
import { sortedPicks } from "@/lib/picks";
import { isPublished, loadLists } from "./lists/data";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Rebuilt at most once an hour, so new repos on the shelf get discovered.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Each repo is 4 URLs (the manual and one per system); a sitemap holds at most 50,000.
  const repos = await sitemapRepos(12000);
  const lists = (await loadLists()).filter(isPublished);
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/shelf`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    ...(lists.length ? [{ url: `${SITE}/lists`, changeFrequency: "daily" as const, priority: 0.8 }] : []),
    ...lists.map((l) => ({ url: `${SITE}/lists/${l.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...["about", "privacy", "terms", "contact"].map((p) => ({ url: `${SITE}/${p}`, changeFrequency: "yearly" as const, priority: 0.3 })),
    ...((await sortedPicks()).length ? [{ url: `${SITE}/finds`, changeFrequency: "weekly" as const, priority: 0.8 }] : []),
    ...repos.flatMap((r) => [
      { url: `${SITE}/${r.fullName}`, lastModified: new Date(r.analyzedAt), changeFrequency: "weekly" as const, priority: 0.7 },
      ...OS_LIST.map((os) => ({
        url: `${SITE}/${r.fullName}/${OS_SLUG[os]}`,
        lastModified: new Date(r.analyzedAt),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ]),
  ];
}
