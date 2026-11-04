"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ShelfQuery } from "@/lib/db";

const MIN_STARS = [
  ["", "Any stars"],
  ["100", "100+ ★"],
  ["1000", "1k+ ★"],
  ["10000", "10k+ ★"],
  ["50000", "50k+ ★"],
  ["100000", "100k+ ★"],
] as const;

const SORT_LABELS: Record<NonNullable<ShelfQuery["sort"]>, string> = {
  stars: "Most stars",
  recent: "Recently run",
  popular: "Most looked up",
  worked: "Most “it works”",
};

// Filters live in the URL, so a filtered shelf can be shared; every change re-renders the page on the server.
export function ShelfFilters({ query, languages }: { query: ShelfQuery; languages: { name: string; count: number }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(query.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  // "Clear filters" and back/forward change the URL without typing; follow them unless someone is mid-typing.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) setQ(query.q ?? "");
  }, [query.q]);

  return (
    <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
      <label className="filter filter-q">
        <span className="filter-label">Search</span>
        <input
          ref={input}
          type="search"
          name="q"
          value={q}
          placeholder="name or description…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => update("q", v.trim()), 300);
          }}
        />
      </label>
      <label className="filter">
        <span className="filter-label">Sort</span>
        <select name="sort" value={query.sort ?? "stars"} onChange={(e) => update("sort", e.target.value === "stars" ? "" : e.target.value)}>
          {Object.entries(SORT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span className="filter-label">Minimum stars</span>
        <select name="min" value={query.minStars ? String(query.minStars) : ""} onChange={(e) => update("min", e.target.value)}>
          {MIN_STARS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span className="filter-label">Language</span>
        <select name="lang" value={query.language ?? ""} onChange={(e) => update("lang", e.target.value)}>
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name} ({l.count})
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span className="filter-label">Difficulty</span>
        <select name="level" value={query.difficulty ?? ""} onChange={(e) => update("level", e.target.value)}>
          <option value="">Any</option>
          <option value="Easy">Easy</option>
          <option value="Moderate">Moderate</option>
          <option value="Involved">Involved</option>
        </select>
      </label>
    </form>
  );
}
