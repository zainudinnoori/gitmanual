import Link from "next/link";
import { compactCount } from "@/lib/format";
import type { RepoCard } from "@/lib/db";
import { Wrenches } from "./ui";

const LEVEL: Record<string, { n: number; time: string }> = {
  Easy: { n: 1, time: "~5 min" },
  Moderate: { n: 2, time: "~15 min" },
  Involved: { n: 3, time: "30+ min" },
};


// Tagged for a day after the trending job finds it, so each day's batch stands out on the shelf.
export const risingToday = (r: RepoCard) => r.risingAt !== null && Date.now() - r.risingAt < 864e5;

// One repo on the shelf, drawn like the label on a flat-pack box: what it is, then how hard it is to put together.
// `href` overrides the link, e.g. to a system's page from a list for that system.
export function ShelfCard({ repo: r, href }: { repo: RepoCard; href?: string }) {
  const [owner, name] = r.fullName.split("/");
  const level = LEVEL[r.difficulty] ?? LEVEL.Moderate;
  return (
    <Link className="shelf-card" href={href ?? `/${r.fullName}`}>
      <span className="shelf-top">
        <span className="shelf-owner" translate="no">
          {owner}/
        </span>
        {risingToday(r) && <span className="rising-tag">Rising</span>}
        <span className="shelf-stars num" title={`${r.stars.toLocaleString()} stars`}>
          ★ {compactCount(r.stars)}
        </span>
      </span>
      <span className="shelf-name" translate="no">
        {name}
      </span>
      {r.description && <span className="shelf-desc">{r.description.replace(/:[a-z0-9_+-]+:\s*/g, "")}</span>}
      <span className="shelf-spec">
        <span className="shelf-level">
          <Wrenches n={level.n} /> {r.difficulty}
          <span className="shelf-time">{level.time}</span>
        </span>
        {r.language && <span className="chip">{r.language}</span>}
      </span>
      <span className="shelf-foot">
        {r.worked > 0 ? <span className="ok">✓ {r.worked} got it running</span> : <span />}
        <span className="shelf-open" aria-hidden="true">
          Open manual →
        </span>
      </span>
    </Link>
  );
}

// The compact version for "Rising this week": a ranked line per repo (ranked by stars).
export function RisingCard({ repo: r, rank }: { repo: RepoCard; rank: number }) {
  const [owner, name] = r.fullName.split("/");
  return (
    <Link className="rising-card" href={`/${r.fullName}`}>
      <span className="rising-rank num" aria-hidden="true">
        {rank}
      </span>
      <span className="rising-body">
        <span className="rising-name" translate="no">
          <span className="rising-owner">{owner}/</span>
          {name}
        </span>
        {r.description && <span className="rising-desc">{r.description.replace(/:[a-z0-9_+-]+:\s*/g, "")}</span>}
        <span className="rising-meta">
          <span className="rising-stars num">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
            {compactCount(r.stars)}
            <span className="sr-only"> stars</span>
          </span>
          {r.language && <span>{r.language}</span>}
          <span>{r.difficulty}</span>
        </span>
      </span>
    </Link>
  );
}
