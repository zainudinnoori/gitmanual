import type { MetadataRoute } from "next";
import { sitemapRepos } from "@/lib/db";
import { sortedPicks } from "@/lib/picks";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Rebuilt at most once an hour, so new repos on the shelf get discovered.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repos = await sitemapRepos();
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/shelf`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    ...["about", "privacy", "terms", "contact"].map((p) => ({ url: `${SITE}/${p}`, changeFrequency: "yearly" as const, priority: 0.3 })),
    ...((await sortedPicks()).length ? [{ url: `${SITE}/finds`, changeFrequency: "weekly" as const, priority: 0.8 }] : []),
    ...repos.map((r) => ({
      url: `${SITE}/${r.fullName}`,
      lastModified: new Date(r.analyzedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
