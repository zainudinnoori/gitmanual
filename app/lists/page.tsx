import type { Metadata } from "next";
import Link from "next/link";
import { OS_LABEL, OS_LIST } from "@/lib/os";
import { OsIcon, ThemeIcon } from "../icons";
import { isPublished, loadLists } from "./data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Lists: open-source apps by what they do and where they run",
  description: "Self-hosted apps, AI tools, command-line tools and MCP servers that run on macOS, Windows or Linux, each with a setup manual.",
  alternates: { canonical: "/lists" },
};

export default async function ListsPage() {
  const lists = (await loadLists()).filter(isPublished);
  return (
    <div className="wrap shelf-page">
      <header className="shelf-page-head">
        <div>
          <p className="eyebrow">Lists</p>
          <h1 className="display-md">Find something that runs on your computer</h1>
          <p className="lead">Open-source projects grouped by what they do, checked against each system.</p>
        </div>
      </header>
      {lists.length ? (
        OS_LIST.map((os) => {
          const mine = lists.filter((l) => l.os === os);
          return (
            mine.length > 0 && (
              <section key={os} className="lists-group" aria-labelledby={`lists-${os}`}>
                <h2 id={`lists-${os}`}>
                  <OsIcon os={os} size={22} /> {OS_LABEL[os]}
                </h2>
                <ul className="lists-grid">
                  {mine.map((l) => (
                    <li key={l.slug}>
                      <Link className="list-card" href={`/lists/${l.slug}`}>
                        <span className="list-icon">
                          <ThemeIcon theme={l.theme} />
                        </span>
                        <span className="list-title">{l.title}</span>
                        <span className="list-peek" translate="no">
                          {l.repos
                            .slice(0, 3)
                            .map((r) => r.fullName.split("/")[1])
                            .join(" · ")}
                        </span>
                        <span className="list-count num">{l.repos.length >= 60 ? "60+" : l.repos.length} repos →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          );
        })
      ) : (
        <div className="panel shelf-empty">
          <h2>No lists yet</h2>
          <p className="note">Lists fill up as people look up repos.</p>
          <Link className="btn btn-go btn-sm" href="/shelf">
            Browse the shelf
          </Link>
        </div>
      )}
    </div>
  );
}
