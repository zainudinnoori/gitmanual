"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FindsTab, Pick } from "@/lib/picks";
import { Post, type Curator } from "./post";

// The first page comes from the server; more load as the reader nears the end (and from the button, as a fallback).
export function Feed({ tab, initial, next: firstNext, curator }: { tab: FindsTab; initial: Pick[]; next: number | null; curator: Curator }) {
  const [picks, setPicks] = useState(initial);
  const [next, setNext] = useState(firstNext);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const more = useCallback(async () => {
    if (next === null || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/finds?tab=${tab}&offset=${next}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: { picks: Pick[]; next: number | null } = await res.json();
      setPicks((p) => [...p, ...data.picks]);
      setNext(data.next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [next, loading, tab]);

  useEffect(() => {
    const el = end.current;
    if (!el || next === null || failed) return;
    // Start loading well before the end, so scrolling doesn't hit a wall.
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && more(), { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, next, failed]);

  return (
    <>
      {picks.map((p, i) => (
        <Post key={`${p.url}-${p.repo}`} p={p} curator={curator} eager={i === 0} />
      ))}
      <div ref={end} className="fb-more-row" aria-live="polite">
        {next !== null ? (
          <button type="button" className="btn" onClick={more} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" /> Loading…
              </>
            ) : failed ? (
              "Couldn't load more. Try again"
            ) : (
              "Load more"
            )}
          </button>
        ) : (
          picks.length > 0 && <p className="note">That&apos;s every post so far.</p>
        )}
      </div>
    </>
  );
}
