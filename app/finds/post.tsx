import Link from "next/link";
import type { Pick } from "@/lib/picks";
import { Caption } from "./caption";
import { ReelPlayer } from "./reel";

export type Curator = { name: string; avatar?: string };

export function FacebookMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <path d="M13.4 19.5v-6h2l.3-2.4h-2.3V9.6c0-.7.2-1.2 1.2-1.2h1.2V6.3c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.8h-2v2.4h2v6z" fill="#fff" />
    </svg>
  );
}

function Avatar({ curator }: { curator: Curator }) {
  const initials = curator.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="fb-avatar fb-avatar-sm" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- the page's own profile picture */}
      {curator.avatar ? <img src={curator.avatar} alt="" /> : initials}
    </span>
  );
}

// One Facebook post: who and when, the caption, the original image, a link preview to its manual, and actions.
// eager: the first post loads its image right away (it's what people see first); the rest load as they scroll near.
export function Post({ p, curator, eager }: { p: Pick; curator: Curator; eager?: boolean }) {
  const name = p.repo.split("/")[1];
  const date = new Date(`${p.date}T12:00:00`).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
  const alt = p.caption?.split(/\r?\n/)[0] ?? `${p.repo} ${p.kind}`;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- the original post image, already sized by Facebook
    <img src={p.image} alt={alt} width={1080} height={1080} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "auto"} />
  );
  return (
    <article className="fb-post">
      <header className="fb-post-head">
        <Avatar curator={curator} />
        <div>
          <b>{curator.name}</b>
          <a href={p.url} target="_blank" rel="noreferrer">
            <time dateTime={p.date}>{date}</time> · <FacebookMark size={12} /> Facebook
          </a>
        </div>
      </header>

      {p.caption && <Caption text={p.caption} />}

      {/* The poster opens the manual; a Reel plays right here (or opens on Facebook if it can't be embedded). */}
      {p.kind === "reel" && p.video ? (
        <ReelPlayer cover={p.image} alt={alt} embed={p.video} repo={p.repo} eager={eager} />
      ) : p.kind === "reel" ? (
        <a className="fb-media" href={p.url} target="_blank" rel="noreferrer" aria-label={`Watch the Reel about ${p.repo} on Facebook`}>
          {img}
          <span className="find-play" aria-hidden="true">
            ▶
          </span>
        </a>
      ) : (
        <Link className="fb-media" href={`/${p.repo}`} aria-label={`Open the setup manual for ${p.repo}`}>
          {img}
        </Link>
      )}

      {/* How a shared link looks in a feed: where it goes and what it is. */}
      <Link className="fb-preview" href={`/${p.repo}`}>
        <span className="fb-preview-host">gitmanual · setup manual</span>
        <b>How to set up {name}</b>
        <span>Will it work on your device, what you need, and the steps for macOS, Windows or Linux.</span>
      </Link>

      <footer className="fb-actions">
        <a href={p.url} target="_blank" rel="noreferrer">
          <FacebookMark size={16} /> {p.kind === "reel" ? "Watch on Facebook" : "View on Facebook"}
        </a>
        <Link href={`/${p.repo}`}>Open the manual →</Link>
      </footer>
    </article>
  );
}
