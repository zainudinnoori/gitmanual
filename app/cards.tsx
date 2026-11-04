import Link from "next/link";
import type { RepoCard } from "@/lib/db";
import { Wrenches } from "./ui";

const LEVEL: Record<string, { n: number; time: string }> = {
  Easy: { n: 1, time: "~5 min" },
  Moderate: { n: 2, time: "~15 min" },
  Involved: { n: 3, time: "30+ min" },
};

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
}

// One repo on the shelf, drawn like the label on a flat-pack box: what it is, then how hard it is to put together.
export function ShelfCard({ repo: r }: { repo: RepoCard }) {
  const [owner, name] = r.fullName.split("/");
  const level = LEVEL[r.difficulty] ?? LEVEL.Moderate;
  return (
    <Link className="shelf-card" href={`/${r.fullName}`}>
      <span className="shelf-top">
        <span className="shelf-owner" translate="no">
          {owner}/
        </span>
        <span className="shelf-stars num" title={`${r.stars.toLocaleString()} stars`}>
          ★ {compact(r.stars)}
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
