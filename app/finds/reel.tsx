"use client";

import { useState } from "react";

// A Reel's cover with a play button. Facebook's player (and its cookies) only loads once someone presses play,
// so the feed stays fast and private until then; the Reel then plays right here instead of on Facebook.
export function ReelPlayer({ cover, alt, embed, repo, eager }: { cover: string; alt: string; embed: string; repo: string; eager?: boolean }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="fb-reel">
        <iframe
          src={embed}
          title={`Reel about ${repo}`}
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button type="button" className="fb-media fb-reel-cover" onClick={() => setPlaying(true)} aria-label={`Play the Reel about ${repo}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the Reel's cover image */}
      <img src={cover} alt={alt} width={1080} height={1080} loading={eager ? "eager" : "lazy"} decoding="async" />
      <span className="find-play" aria-hidden="true">
        ▶
      </span>
      <span className="fb-reel-note">Plays from Facebook</span>
    </button>
  );
}
