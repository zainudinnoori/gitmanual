import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { listFbPosts } from "./db";

// Optional: "Finds", posts from a Facebook Page (posters and Reels), each pointing at a repo's manual.
// Off unless FINDS_NAME is set, so a fresh clone has no Finds page; an instance switches it on with env vars:
//   FINDS_NAME    the Page's name, e.g. "My Finds" (turns the feature on)
//   FINDS_ABOUT   a one-line tagline
//   FINDS_URL     the Page's Facebook address
//   FINDS_AVATAR  the Page's profile picture URL (default: the Page's own picture, when FB_PAGE_ID is set)
// Posts come from two sources, shown together: the Facebook Page sync (lib/facebook.ts), and optional
// files in content/finds/*.md (a few settings lines between --- and ---, then the caption as written).
export type Pick = {
  repo: string; // owner/repo
  kind: "poster" | "reel";
  image: string; // an image URL: a 1080×1080 poster, or the Reel's cover
  url: string; // the post or Reel on Facebook
  caption?: string;
  date: string; // YYYY-MM-DD
  video?: string; // Reels: Facebook's embeddable player URL, loaded only when someone presses play
};

// Facebook's official embedded player for a video or Reel URL.
export function videoEmbed(videoUrl: string): string {
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(videoUrl)}&show_text=false&autoplay=true&width=560`;
}

export type Picks = { curator: string; about?: string; url?: string; avatar?: string; picks: Pick[] };

const DIR = path.join(process.cwd(), "content", "finds");

function parse(file: string, text: string): Pick | null {
  const m = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    console.warn(`gitmanual finds: ${file} needs a --- settings block at the top; skipped.`);
    return null;
  }
  const meta = Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([a-z]+)\s*:\s*(.*?)\s*$/i))
      .filter((x): x is RegExpMatchArray => Boolean(x))
      .map(([, k, v]) => [k.toLowerCase(), v.replace(/^["']|["']$/g, "")]),
  );
  if (!meta.repo || !meta.image || !meta.url) {
    console.warn(`gitmanual finds: ${file} needs repo, image and url; skipped.`);
    return null;
  }
  return {
    repo: meta.repo,
    kind: meta.kind === "reel" ? "reel" : "poster",
    image: meta.image,
    url: meta.url,
    date: meta.date || file.slice(0, 10),
    caption: m[2].trim() || undefined,
    // Optional "video:" line in a Reel's file: its Facebook URL (the Reel's link works).
    video: meta.kind === "reel" ? videoEmbed(meta.video || meta.url) : undefined,
  };
}

function load(): Pick[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => /\.(md|txt)$/i.test(f));
  } catch {
    return [];
  }
  return files.map((f) => parse(f, readFileSync(path.join(DIR, f), "utf8"))).filter((p): p is Pick => Boolean(p));
}

const PAGE_PICTURE = process.env.FB_PAGE_ID ? `https://graph.facebook.com/${process.env.FB_PAGE_ID}/picture?type=large` : undefined;

export const FINDS_ON = Boolean(process.env.FINDS_NAME);

// Page settings (name, about, link, avatar).
export const PICKS: Omit<Picks, "picks"> = {
  curator: process.env.FINDS_NAME ?? "Finds",
  about: process.env.FINDS_ABOUT || undefined,
  url: process.env.FINDS_URL || undefined,
  avatar: process.env.FINDS_AVATAR || PAGE_PICTURE,
};

// Read on every call, so new posts (synced or files) show up without restarting the server.
export async function sortedPicks(): Promise<Pick[]> {
  if (!FINDS_ON) return [];
  const synced: Pick[] = (await listFbPosts()).map((p) => ({
    repo: p.repo,
    kind: p.kind,
    // ?v= changes when the image is re-synced, so the year-long browser cache never shows an old copy.
    image: `/finds/image/${encodeURIComponent(p.id)}?v=${p.syncedAt ?? 0}`,
    url: p.permalink,
    caption: p.caption ?? undefined,
    date: new Date(p.createdAt).toISOString().slice(0, 10),
    video:
      p.kind === "reel"
        ? videoEmbed(p.videoId && process.env.FB_PAGE_ID ? `https://www.facebook.com/${process.env.FB_PAGE_ID}/videos/${p.videoId}` : p.permalink)
        : undefined,
  }));
  // A file for the same Facebook post wins over the synced copy (handy for fixing a caption).
  const files = load();
  const fileUrls = new Set(files.map((f) => f.url));
  return [...files, ...synced.filter((p) => !fileUrls.has(p.url))].sort((a, b) => b.date.localeCompare(a.date));
}

export async function picksFor(fullName: string): Promise<Pick[]> {
  return (await sortedPicks()).filter((p) => p.repo.toLowerCase() === fullName.toLowerCase());
}

export type FindsTab = "all" | "posters" | "reels";
export const FINDS_PAGE = 8;

export function parseTab(t: string | undefined | null): FindsTab {
  return t === "posters" || t === "reels" ? t : "all";
}

// One page of the feed for a tab, plus counts for the tab labels.
export async function pagePicks(tab: FindsTab, offset = 0, limit = FINDS_PAGE) {
  const all = await sortedPicks();
  const list = tab === "all" ? all : all.filter((p) => (tab === "reels" ? p.kind === "reel" : p.kind === "poster"));
  const start = Math.max(0, offset);
  return {
    picks: list.slice(start, start + limit),
    next: start + limit < list.length ? start + limit : null,
    counts: { all: all.length, posters: all.filter((p) => p.kind === "poster").length, reels: all.filter((p) => p.kind === "reel").length },
  };
}
