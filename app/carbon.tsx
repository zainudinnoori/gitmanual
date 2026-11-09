"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// One Carbon ad (cover format) where it's placed: manual pages of public repos, the shelf, lists and /developers.
// Live only in production with NEXT_PUBLIC_CARBON_SERVE and NEXT_PUBLIC_CARBON_PLACEMENT set (so self-hosted copies
// don't serve gitmanual's ads); `next dev` shows a placeholder of the same size instead, so local views never count.
// Carbon's tag goes inside a sized box so the ad doesn't shift the page, and is loaded again on each new page, since
// moving between pages here doesn't reload the browser.

const valid = (v: string | undefined) => (v && /^[\w-]+$/.test(v) ? v : null);
const SERVE = valid(process.env.NEXT_PUBLIC_CARBON_SERVE);
const PLACEMENT = valid(process.env.NEXT_PUBLIC_CARBON_PLACEMENT);
const DEV = process.env.NODE_ENV === "development";
const LIVE = !DEV && SERVE && PLACEMENT;

export function CarbonAd({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const page = usePathname();
  useEffect(() => {
    const el = box.current;
    if (!LIVE || !el) return;
    const tag = document.createElement("script");
    tag.async = true;
    tag.id = "_carbonads_js";
    tag.src = `https://cdn.carbonads.com/carbon.js?serve=${SERVE}&placement=${PLACEMENT}&format=cover`;
    el.appendChild(tag);
    return () => {
      el.innerHTML = "";
    };
  }, [page]);

  if (DEV)
    return (
      <div className={`ad ad-placeholder${className ? ` ${className}` : ""}`} aria-hidden="true">
        <span>Carbon ad</span>
        <small>Placeholder, only in local dev</small>
      </div>
    );
  if (!LIVE) return null;
  return <div ref={box} className={`ad${className ? ` ${className}` : ""}`} />;
}
