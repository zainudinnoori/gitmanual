import { fbKnownIds, saveFbPost, shelfNames, type FbPost } from "./db";
import { parseRepoUrl } from "./github";

// Pulls the curator's Facebook Page posts through the Graph API (FB_PAGE_ID + FB_PAGE_TOKEN) into the database.
// A post joins /finds when it points at a repo, checked in this order:
//   1. a gitmanual.com/owner/repo or github.com/owner/repo link in the caption or the shared link,
//   2. the same kind of link in the Page's own comments (where many creators put links; needs pages_read_user_content),
//   3. the caption naming a repo that's already on the shelf ("Peekaboo lets agents…" → openclaw/Peekaboo).

const VERSION = process.env.FB_GRAPH_VERSION ?? "v23.0";
const BASE_FIELDS = "id,message,created_time,permalink_url,full_picture,attachments{media_type,type,url,media,target{id}}";
const COMMENT_FIELDS = `${BASE_FIELDS},comments.limit(10){message,from{id}}`;

// Repo names that are also everyday words, so a caption mentioning them doesn't count as naming the project.
const COMMON = new Set(
  "server core kit app apps web desktop cli docs api client sdk react vite next nuxt angular vue preact rails django flask hugo caddy memos homepage actual sim notes search".split(" "),
);
const MAX_PAGES = 10; // 25 posts each: plenty for a first sync, and later syncs stop at the first page of known posts

// github.com paths that aren't repos.
const NOT_OWNERS = /^(features|about|pricing|topics|collections|trending|sponsors|marketplace|orgs|settings|login|join|apps|enterprise|explore)$/i;

type GraphPost = {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
  attachments?: { data?: { media_type?: string; type?: string; url?: string; media?: { image?: { src?: string } }; target?: { id?: string } }[] };
  comments?: { data?: { message?: string; from?: { id?: string } }[] };
};

export type SyncResult = {
  added: number;
  updated: number;
  matched: { id: string; repo: string; by: "link" | "comment" | "name" }[];
  skipped: { id: string; reason: string; caption: string }[];
  warnings: string[];
};

// Facebook wraps outgoing links as l.facebook.com/l.php?u=<real link>.
function unwrap(url: string): string {
  try {
    const u = new URL(url);
    return /(^|\.)facebook\.com$/.test(u.host) && u.searchParams.get("u") ? u.searchParams.get("u")! : url;
  } catch {
    return url;
  }
}

function linkIn(texts: string[]): string | null {
  const site = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host.replace(/^www\./, "") : null;
  for (const text of texts) {
    for (const m of text.matchAll(/(?:https?:\/\/)?(?:www\.)?((?:github\.com|gitmanual\.[a-z.]+|[a-z0-9.-]+\.[a-z]{2,})\/[\w.-]+\/[\w.-]+)/gi)) {
      const host = m[1].split("/")[0].toLowerCase();
      if (host !== "github.com" && !/^gitmanual\./.test(host) && host !== site) continue;
      const [, owner, repo] = m[1].split("/");
      if (NOT_OWNERS.test(owner)) continue;
      const ref = parseRepoUrl(`${owner}/${repo.replace(/[.,;:!?)]+$/, "")}`);
      if (ref) return `${ref.owner}/${ref.repo}`;
    }
  }
  return null;
}

// The caption names a shelf repo the way people write project names: capitalized ("Peekaboo", "LosslessCut"),
// or exactly as the repo spells itself ("scrcpy"). Hyphens and dots don't matter ("lossless-cut" = "LosslessCut").
function nameIn(caption: string, names: Map<string, string>): string | null {
  const hits = new Set<string>();
  for (const word of caption.match(/[A-Za-z][\w.-]{3,}/g) ?? []) {
    const w = word.replace(/[.-]+$/, "");
    const key = w.toLowerCase().replace(/[-_.]/g, "");
    const full = names.get(key);
    if (!full || COMMON.has(key)) continue;
    const own = full.split("/")[1];
    if (/^[A-Z]/.test(w) || (w === own && own.length >= 5)) hits.add(full);
  }
  return hits.size === 1 ? [...hits][0] : null; // two different projects named: too unsure
}

export function repoFrom(post: GraphPost, pageId?: string, names?: Map<string, string>): { repo: string; by: "link" | "comment" | "name" } | null {
  const link = linkIn([post.message ?? "", ...(post.attachments?.data ?? []).map((a) => (a.url ? unwrap(a.url) : ""))]);
  if (link) return { repo: link, by: "link" };
  const own = (post.comments?.data ?? []).filter((c) => !pageId || c.from?.id === pageId).map((c) => c.message ?? "");
  const fromComment = linkIn(own);
  if (fromComment) return { repo: fromComment, by: "comment" };
  const byName = names && post.message ? nameIn(post.message, names) : null;
  return byName ? { repo: byName, by: "name" } : null;
}

// Tokens pasted into a dashboard often pick up quotes, spaces or a stray character at the end.
function pageToken(): string | null {
  const raw = process.env.FB_PAGE_TOKEN?.trim().replace(/^["']|["']$/g, "").trim();
  if (!raw) return null;
  if (!/^[A-Za-z0-9]+$/.test(raw)) {
    const bad = [...new Set(raw.replace(/[A-Za-z0-9]/g, ""))].map((c) => (c === " " ? "a space" : `"${c}"`)).join(", ");
    throw new Error(`FB_PAGE_TOKEN contains ${bad}. Facebook tokens are only letters and numbers: paste it again without extra characters.`);
  }
  return raw;
}

// Facebook echoes the token in some errors; never pass it on.
function hideToken(message: string): string {
  return message.replace(/EAA[A-Za-z0-9]{20,}\S*/g, "[token]");
}

async function graph<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(`Facebook API: ${hideToken(body?.error?.message ?? String(res.status))}`);
  return body as T;
}

async function download(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "image/jpeg" };
  } catch {
    return null;
  }
}

// The post's own image is a 720×720 crop; the photo object has the original (e.g. a 1080×1350 poster).
async function originalImage(photoId: string, token: string): Promise<string | null> {
  try {
    const photo: { images?: { width: number; source: string }[] } = await graph(
      `https://graph.facebook.com/${VERSION}/${photoId}?fields=images&access_token=${encodeURIComponent(token)}`,
    );
    return photo.images?.sort((a, b) => b.width - a.width)[0]?.source ?? null;
  } catch {
    return null;
  }
}

// images: re-download the image of posts already saved (e.g. after a change in how images are picked).
export async function syncFacebook(opts: { images?: boolean } = {}): Promise<SyncResult> {
  const page = process.env.FB_PAGE_ID;
  const token = pageToken();
  if (!page || !token) throw new Error("Set FB_PAGE_ID and FB_PAGE_TOKEN to sync the Facebook page.");

  const [known, names] = await Promise.all([fbKnownIds(), shelfNames()]);
  const result: SyncResult = { added: 0, updated: 0, matched: [], skipped: [], warnings: [] };
  const url = (fields: string) =>
    `https://graph.facebook.com/${VERSION}/${page}/posts?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(token)}`;
  let next: string | undefined = url(COMMENT_FIELDS);

  for (let i = 0; next && i < MAX_PAGES; i++) {
    let batch: { data: GraphPost[]; paging?: { next?: string } };
    try {
      batch = await graph(next);
    } catch (e) {
      // Without pages_read_user_content the comments field is refused; carry on with captions only.
      if (i === 0 && /pages_read_user_content/.test(String(e))) {
        result.warnings.push("Comments skipped: add the pages_read_user_content permission to read links in the Page's own comments.");
        next = url(BASE_FIELDS);
        batch = await graph(next);
      } else throw e;
    }
    for (const post of batch.data) {
      const found = repoFrom(post, page, names);
      if (!found) {
        result.skipped.push({ id: post.id, reason: "no repo link or known project name", caption: (post.message ?? "").split("\n")[0].slice(0, 80) });
        continue;
      }
      const repo = found.repo;
      result.matched.push({ id: post.id, repo, by: found.by });
      const attachment = post.attachments?.data?.[0];
      const kind: FbPost["kind"] = /video|reel/i.test(`${attachment?.media_type ?? ""} ${attachment?.type ?? ""}`) ? "reel" : "poster";
      const isNew = !known.has(post.id);
      const wantImage = isNew || opts.images;
      const original = wantImage && kind === "poster" && attachment?.target?.id ? await originalImage(attachment.target.id, token) : null;
      const imageUrl = original ?? attachment?.media?.image?.src ?? post.full_picture;
      if (!imageUrl) {
        result.skipped.push({ id: post.id, reason: "no image", caption: (post.message ?? "").split("\n")[0].slice(0, 80) });
        continue;
      }
      await saveFbPost(
        {
          id: post.id,
          repo,
          kind,
          caption: post.message?.trim() || null,
          permalink: post.permalink_url ?? `https://www.facebook.com/${post.id}`,
          createdAt: new Date(post.created_time).getTime(),
          videoId: kind === "reel" ? (attachment?.target?.id ?? null) : null,
        },
        // Facebook's image links expire, so keep our own copy; known posts keep theirs unless it's missing.
        wantImage ? await download(imageUrl) : null,
      );
      if (isNew) result.added++;
      else result.updated++;
    }
    // Later syncs: once a whole page is already known (or has no repo to show), older posts are too.
    if (!opts.images && batch.data.length && batch.data.every((p) => known.has(p.id) || !repoFrom(p, page, names))) break;
    next = batch.paging?.next;
  }
  return result;
}
