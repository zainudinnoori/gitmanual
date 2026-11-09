import { countRising, facetCounts, listRepos } from "@/lib/db";
import { LISTS, MIN_LIST } from "@/lib/lists";
import { OS_LIST } from "@/lib/os";
import { REPO_URL, SITE_URL } from "@/lib/site";
import { Landing, type SystemLists } from "./hero";

// Cached and rebuilt at most every 5 minutes: the shelf and rising lists don't need to be fresher than that.
export const revalidate = 300;

export default async function Home() {
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
    <>
      <SiteJsonLd />
      <Landing
        recent={others(recent)}
        popular={others(popular)}
        rising={rising}
        risingTotal={risingTotal}
        systems={systems}
        extension={process.env.NEXT_CHROME_EXTENSION_URL || null}
      />
    </>
  );
}

// Who the site is, for search engines: Google takes the name it shows above results ("gitmanual", not the bare
// domain) and the logo from here, and the sameAs links tie the site to its GitHub repo, extension and Page.
function SiteJsonLd() {
  const sameAs = [REPO_URL, process.env.NEXT_CHROME_EXTENSION_URL, process.env.FINDS_URL].filter((u): u is string => Boolean(u));
  const graph = [
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "gitmanual", alternateName: new URL(SITE_URL).host, url: `${SITE_URL}/`, publisher: { "@id": `${SITE_URL}/#org` } },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "gitmanual",
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/apple-icon.png`, width: 180, height: 180 },
      description: "Setup manuals for open source: will a GitHub project run on your device, what you need, and the exact steps.",
      ...(sameAs.length ? { sameAs } : {}),
    },
  ];
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe in a script tag once "<" is escaped.
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c") }}
    />
  );
}
