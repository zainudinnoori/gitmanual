import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FINDS_ON, PICKS, pagePicks, parseTab, type FindsTab } from "@/lib/picks";
import { Feed } from "./feed";
import { FacebookMark } from "./post";

// New posts (synced or files) should appear right away.
export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ tab?: string }> }): Promise<Metadata> {
  const tab = parseTab((await searchParams).tab);
  return {
    title: tab === "reels" ? `${PICKS.curator} Reels` : tab === "posters" ? `${PICKS.curator} posters` : `${PICKS.curator} on Facebook`,
    description: `${PICKS.about ?? "Open-source finds"} Posts from the ${PICKS.curator} Facebook page, each linked to its setup manual on gitmanual.`,
    alternates: { canonical: tab === "all" ? "/finds" : `/finds?tab=${tab}` },
  };
}

const TABS: [FindsTab, string][] = [
  ["all", "All"],
  ["posters", "Posters"],
  ["reels", "Reels"],
];

// A feed of the curator's Facebook posts, laid out like a page so the source is obvious.
export default async function FindsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!FINDS_ON) notFound();
  const tab = parseTab((await searchParams).tab);
  const { picks, next, counts } = await pagePicks(tab);
  const curator = { name: PICKS.curator, avatar: PICKS.avatar };

  return (
    <div className="wrap fb">
      <div className="fb-body">
        {/* The page's title, intro and tabs sit in a sticky column on the left; the feed runs on the right. */}
        <aside className="fb-side">
        <header className="fb-title">
          <p className="eyebrow">
            <FacebookMark /> From the Facebook page
          </p>
          <h1 className="display-md">{PICKS.curator}</h1>
          <p className="lead">
            {PICKS.about ?? "Open-source finds."} Each post links to its setup manual, so you can go from &ldquo;cool&rdquo; to running it.
          </p>
          {PICKS.url && (
            <a className="fb-link" href={PICKS.url} target="_blank" rel="noreferrer">
              Follow {PICKS.curator} on Facebook ↗
            </a>
          )}
        </header>

        <nav className="fb-tabs" aria-label="Show">
          {TABS.map(([t, label]) => (
            <Link key={t} href={t === "all" ? "/finds" : `/finds?tab=${t}`} aria-current={t === tab ? "page" : undefined} scroll={false}>
              {label} <span className="count">{counts[t]}</span>
            </Link>
          ))}
        </nav>
        </aside>

        <section className="fb-feed" aria-label={`Posts from ${PICKS.curator}`}>
          {picks.length === 0 ? (
            <article className="fb-post fb-empty">
              <p>{tab === "reels" ? "No Reels yet." : tab === "posters" ? "No posters yet." : "No posts yet. The first find is on its way."}</p>
            </article>
          ) : (
            <Feed key={tab} tab={tab} initial={picks} next={next} curator={curator} />
          )}
        </section>
      </div>
    </div>
  );
}
