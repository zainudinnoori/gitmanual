"use client";

import { Fragment, useState } from "react";

const LONG = 160; // characters (or 4 lines) before "See more", roughly where Facebook folds a caption

// Turns #hashtags and URLs into links, the way Facebook shows them; everything else stays as typed.
function linkify(line: string) {
  return line.split(/(#[\p{L}\p{N}_]+|https?:\/\/[^\s]+)/gu).map((part, i) => {
    if (part.startsWith("#") && part.length > 1)
      return (
        <a key={i} className="fb-tag" href={`https://www.facebook.com/hashtag/${encodeURIComponent(part.slice(1).toLowerCase())}`} target="_blank" rel="noreferrer">
          {part}
        </a>
      );
    if (/^https?:\/\//.test(part))
      return (
        <a key={i} className="fb-tag" href={part} target="_blank" rel="noreferrer">
          {part.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Caption({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const long = text.length > LONG || lines.length > 4;
  const [open, setOpen] = useState(false);

  // Folded: the first lines up to the limit, then "… See more".
  let shown = lines;
  if (long && !open) {
    shown = [];
    let used = 0;
    for (const l of lines.slice(0, 4)) {
      if (used + l.length > LONG) {
        // Cut at a whole word; if not even one word fits, fold after the previous line.
        const cut = l.slice(0, Math.max(0, LONG - used));
        const words = cut.includes(" ") ? cut.replace(/\s+\S*$/, "") : "";
        if (words) shown.push(words);
        break;
      }
      shown.push(l);
      used += l.length;
    }
  }

  // "… See more" belongs on the last line with text, not on a blank one.
  if (long && !open) while (shown.length > 1 && !shown[shown.length - 1].trim()) shown = shown.slice(0, -1);

  return (
    <div className="fb-caption">
      {shown.map((l, i) => (
        <p key={i}>
          {l ? linkify(l) : " "}
          {long && !open && i === shown.length - 1 && (
            <>
              {"… "}
              <button type="button" className="fb-more" aria-expanded={false} onClick={() => setOpen(true)}>
                See more
              </button>
            </>
          )}
        </p>
      ))}
      {long && open && (
        <p>
          <button type="button" className="fb-more" aria-expanded={true} onClick={() => setOpen(false)}>
            See less
          </button>
        </p>
      )}
    </div>
  );
}
