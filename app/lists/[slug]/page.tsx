import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LISTS, listBySlug, MIN_LIST } from "@/lib/lists";
import { OS_LABEL, OS_LIST, OS_SLUG } from "@/lib/os";
import { ShelfCard } from "../../cards";
import { OsIcon } from "../../icons";
import { isPublished, loadLists } from "../data";

export const revalidate = 3600;

// Built ahead and refreshed hourly like /lists, so opening a list is a cached page rather than 16 database queries.
export const generateStaticParams = () => LISTS.map((l) => ({ slug: l.slug }));

type Props = { params: Promise<{ slug: string }> };

async function find(slug: string) {
  if (!listBySlug(slug)) return null;
  const lists = await loadLists();
  return { list: lists.find((l) => l.slug === slug)!, lists };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await find((await params).slug);
  if (!found) return {};
  const { list } = found;
  const names = list.repos.slice(0, 3).map((r) => r.fullName.split("/")[1]);
  return {
    title: list.title,
    description: `${list.intro}${names.length ? ` Including ${names.join(", ")}.` : ""}`.slice(0, 300),
    alternates: { canonical: `/lists/${list.slug}` },
    // Thin lists still open (they fill up over time) but stay out of search until they're useful.
    robots: list.repos.length < MIN_LIST ? { index: false, follow: true } : undefined,
  };
}

export default async function ListPage({ params }: Props) {
  const found = await find((await params).slug);
  if (!found) notFound();
  const { list, lists } = found;
  const sameTheme = lists.filter((l) => l.theme === list.theme && l.slug !== list.slug && isPublished(l));
  const sameOs = lists.filter((l) => l.os === list.os && l.theme !== list.theme && isPublished(l));

  return (
    <div className="wrap shelf-page">
      <header className="shelf-page-head">
        <div>
          <p className="eyebrow">
            <Link href="/lists">Lists</Link> · {OS_LABEL[list.os]}
          </p>
          <h1 className="display-md">{list.title}</h1>
          <p className="lead">{list.intro}</p>
        </div>
        {sameTheme.length > 0 && (
          <nav className="view-switch" aria-label="Other systems">
            {[list, ...sameTheme]
              .sort((a, b) => OS_LIST.indexOf(a.os) - OS_LIST.indexOf(b.os))
              .map((l) => (
                <Link key={l.slug} href={`/lists/${l.slug}`} aria-current={l.slug === list.slug ? "page" : undefined}>
                  <OsIcon os={l.os} /> {OS_LABEL[l.os]}
                </Link>
              ))}
          </nav>
        )}
      </header>

      <p className="shelf-count">
        {list.repos.length >= 60 ? "Top 60" : list.repos.length} {list.repos.length === 1 ? "repo" : "repos"}, most stars first
      </p>

      {list.repos.length ? (
        <ul className="shelf-grid">
          {list.repos.map((r) => (
            <li key={r.fullName}>
              <ShelfCard repo={r} href={`/${r.fullName}/${OS_SLUG[list.os]}`} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel shelf-empty">
          <h2>Nothing here yet</h2>
          <p className="note">This list fills up as people look up repos.</p>
          <Link className="btn btn-go btn-sm" href="/shelf">
            Browse the shelf
          </Link>
        </div>
      )}

      {sameOs.length > 0 && (
        <section className="lists-group" aria-labelledby="more-lists">
          <h2 id="more-lists">More for {OS_LABEL[list.os]}</h2>
          <ul className="lists-grid">
            {sameOs.map((l) => (
              <li key={l.slug}>
                <Link className="list-card" href={`/lists/${l.slug}`}>
                  <span className="list-title">{l.title}</span>
                  <span className="list-count num">{l.repos.length >= 60 ? "60+" : l.repos.length} repos →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
