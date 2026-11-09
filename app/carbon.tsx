"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { REPO_URL } from "@/lib/site";

// One Carbon ad (cover format) where it's placed: manual pages of public repos, the shelf, lists and /developers.
// Live only in production with NEXT_PUBLIC_CARBON_SERVE and NEXT_PUBLIC_CARBON_PLACEMENT set (so self-hosted copies
// don't serve gitmanual's ads); `next dev` shows a placeholder of the same size instead, so local views never count
// (add ?ad=blocked to the address to see the fallback). Carbon's tag goes inside a sized box so the ad doesn't shift
// the page, and is loaded again on each new page, since moving between pages here doesn't reload the browser.
// When the ad can't show (an ad blocker stopped the script, or no ad came back), the box asks for a sponsor instead.

const valid = (v: string | undefined) => (v && /^[\w-]+$/.test(v) ? v : null);
const SERVE = valid(process.env.NEXT_PUBLIC_CARBON_SERVE);
const PLACEMENT = valid(process.env.NEXT_PUBLIC_CARBON_PLACEMENT);
const DEV = process.env.NODE_ENV === "development";
const LIVE = !DEV && SERVE && PLACEMENT;
const OWNER = REPO_URL?.match(/github\.com\/([\w-]+)\//)?.[1] ?? null;
const WAIT = 4000; // ms for the ad to appear once the script has loaded

export function CarbonAd({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const page = usePathname();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    setBlocked(false);
    if (DEV) {
      if (new URLSearchParams(location.search).get("ad") === "blocked") setBlocked(true);
      return;
    }
    const el = box.current;
    if (!LIVE || !el) return;
    let timer: number | undefined;
    // Shown means something besides the tag landed in the box and takes up room (blockers can also hide it).
    const shown = () => [...el.children].some((c) => c.tagName !== "SCRIPT" && (c as HTMLElement).offsetHeight > 0);
    const tag = document.createElement("script");
    tag.async = true;
    tag.id = "_carbonads_js";
    tag.src = `https://cdn.carbonads.com/carbon.js?serve=${SERVE}&placement=${PLACEMENT}&format=cover`;
    tag.onerror = () => setBlocked(true);
    tag.onload = () => {
      timer = window.setTimeout(() => !shown() && setBlocked(true), WAIT);
    };
    el.appendChild(tag);
    return () => {
      window.clearTimeout(timer);
      el.innerHTML = "";
    };
  }, [page]);

  const cls = `ad${className ? ` ${className}` : ""}`;
  if (DEV)
    return blocked ? (
      <AdFallback className={cls} />
    ) : (
      <div className={`${cls} ad-placeholder`} aria-hidden="true">
        <span>Carbon ad</span>
        <small>Placeholder, only in local dev</small>
      </div>
    );
  if (!LIVE) return null;
  // The box stays in the page while the fallback shows, so the next page has somewhere to load its ad.
  return (
    <>
      {blocked && <AdFallback className={cls} />}
      <div ref={box} className={cls} hidden={blocked} />
    </>
  );
}

// In-house, text links only (Carbon allows that), and only while no Carbon ad is showing.
function AdFallback({ className }: { className: string }) {
  return (
    <aside className={`${className} ad-fallback`} aria-label="Support gitmanual">
      <p className="ad-fallback-h">gitmanual is free and open source</p>
      <p>No account, no paywall. If it saved you an evening, you can help keep it running.</p>
      <div className="ad-fallback-links">
        {OWNER && (
          <a className="btn btn-go btn-sm" href={`https://github.com/sponsors/${OWNER}`} target="_blank" rel="noreferrer">
            Sponsor on GitHub ♥
          </a>
        )}
        {REPO_URL && (
          <a className="btn btn-sm" href={REPO_URL} target="_blank" rel="noreferrer">
            Star the repo
          </a>
        )}
      </div>
    </aside>
  );
}
