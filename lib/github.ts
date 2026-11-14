export type RepoRef = { owner: string; repo: string; ref?: string };

export type RepoMeta = {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  stars: number;
  license: string | null;
  htmlUrl: string;
  pushedAt: string;
  openIssues: number;
  topics: string[];
  archived: boolean;
  homepage: string | null;
  private?: boolean; // read with a visitor's own GitHub access (lib/session.ts), never saved
  createdAt?: string; // missing on manuals saved before it was read
  ownerType?: "User" | "Organization";
};

export type TreeEntry = { path: string; size: number };

const MAX_FILE_BYTES = 200_000;

export class GitHubError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Accepts "owner/repo", "github.com/owner/repo", full URLs, .git suffixes and /tree/<branch> paths.
export function parseRepoUrl(input: string): RepoRef | null {
  let s = input.trim();
  s = s.replace(/^git@github\.com:/, "github.com/");
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (s.startsWith("github.com/")) s = s.slice("github.com/".length);
  const parts = s.split(/[/?#]/).filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  const ref = parts[2] === "tree" && parts[3] ? parts[3] : undefined;
  return { owner, repo, ref };
}

// `token` is a visitor's own GitHub access, for their private repos; otherwise the site's token is used.
function headers(token?: string, accept = "application/vnd.github+json"): HeadersInit {
  const h: Record<string, string> = { Accept: accept, "User-Agent": "gitmanual" };
  const auth = token ?? process.env.GITHUB_TOKEN;
  if (auth) h.Authorization = `Bearer ${auth}`;
  return h;
}

// GitHub sometimes drops a connection or answers 502/503/504 for a moment. Try again twice, after a short pause,
// before failing the whole analysis; real answers (404, rate limits) come back right away.
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (attempt < 3 && [502, 503, 504].includes(res.status)) throw new Error(`GitHub answered ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, attempt * 600));
    }
  }
}

async function gh<T>(path: string, token?: string): Promise<T> {
  const res = await fetchRetry(`https://api.github.com${path}`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) {
    if (token && res.status === 404) throw new GitHubError("GitHub says this access can't see that repo. Check that it includes this repo.", 404);
    if (res.status === 404) throw new GitHubError("Repository not found (or it is private).", 404);
    if (token && res.status === 401) throw new GitHubError("GitHub didn't accept the access: it may have expired or been removed.", 401);
    if (token && (res.status === 403 || res.status === 429)) {
      throw new GitHubError("GitHub refused: the access may not include reading code, or it hit GitHub's hourly limit.", res.status);
    }
    if (res.status === 403 || res.status === 429) {
      throw new GitHubError(
        "GitHub API rate limit hit. Add GITHUB_TOKEN to .env.local to raise the limit.",
        res.status,
      );
    }
    throw new GitHubError(`GitHub API error ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export async function getRepoMeta({ owner, repo }: RepoRef, token?: string): Promise<RepoMeta> {
  const r = await gh<any>(`/repos/${owner}/${repo}`, token);
  return {
    fullName: r.full_name,
    description: r.description,
    defaultBranch: r.default_branch,
    language: r.language,
    stars: r.stargazers_count,
    license: r.license?.spdx_id ?? null,
    htmlUrl: r.html_url,
    pushedAt: r.pushed_at,
    openIssues: r.open_issues_count ?? 0,
    topics: r.topics ?? [],
    archived: Boolean(r.archived),
    private: Boolean(r.private),
    createdAt: r.created_at,
    ownerType: r.owner?.type === "Organization" ? "Organization" : "User",
    homepage: r.homepage ? (/^https?:\/\//.test(r.homepage) ? r.homepage : `https://${r.homepage}`) : null,
  };
}

export async function getTree({ owner, repo }: RepoRef, ref: string, token?: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const t = await gh<any>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, token);
  const entries: TreeEntry[] = (t.tree ?? [])
    .filter((e: any) => e.type === "blob")
    .map((e: any) => ({ path: e.path as string, size: (e.size as number) ?? 0 }));
  return { entries, truncated: Boolean(t.truncated) };
}

// The commit a branch points at right now. A chat is pinned to it, so everything it reads comes from one commit.
export async function getHeadSha({ owner, repo }: RepoRef, branch: string): Promise<string> {
  const r = await gh<any>(`/repos/${owner}/${repo}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`);
  const sha = r?.object?.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) throw new GitHubError(`Couldn't find the latest commit on ${branch}.`, 502);
  return sha;
}

// Paths of ordinary files at a commit (no symlinks, no submodules), for a chat to know what it can ask to read.
export async function listPaths({ owner, repo }: RepoRef, sha: string): Promise<{ paths: string[]; truncated: boolean }> {
  const t = await gh<any>(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
  const paths: string[] = (t.tree ?? []).filter((e: any) => e.type === "blob" && (e.mode === "100644" || e.mode === "100755")).map((e: any) => e.path);
  return { paths, truncated: Boolean(t.truncated) };
}

export type RepoFile =
  | { kind: "file"; text: string }
  | { kind: "missing" | "not-a-file" | "too-large" | "binary" };

// One file at a pinned commit, for chat's read_repo_file tool. Always with the site's token, so it can only see
// public repos. The download itself is capped, not just the size GitHub reports, and a directory, submodule or
// symlink is refused. GitHub answers a symlink to a file with the target's content but the link's own blob sha,
// so content that doesn't hash to the sha GitHub gave isn't the file at that path.
export async function getRepoFile({ owner, repo }: RepoRef, sha: string, path: string, maxBytes: number): Promise<RepoFile> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetchRetry(`https://api.github.com/repos/${owner}/${repo}/contents/${encoded}?ref=${sha}`, { headers: headers(), cache: "no-store" });
  if (res.status === 404) return { kind: "missing" };
  if (!res.ok) throw new GitHubError(`GitHub API error ${res.status}`, res.status);

  // The JSON wraps the file in base64, about 4/3 of its size, plus a little metadata.
  const body = await readCapped(res, Math.ceil(maxBytes * 1.4) + 4096);
  if (body === null) return { kind: "too-large" };
  const j = JSON.parse(body);
  if (Array.isArray(j) || j.type !== "file" || j.path !== path) return { kind: "not-a-file" };
  if (j.size > maxBytes || j.encoding !== "base64" || typeof j.content !== "string") return { kind: "too-large" };
  const bytes = Buffer.from(j.content, "base64");
  if ((await gitBlobSha(bytes)) !== j.sha) return { kind: "not-a-file" };
  const text = bytes.toString("utf8");
  if (text.includes("\u0000")) return { kind: "binary" };
  return { kind: "file", text };
}

// The id git gives a file's content, the same one GitHub reports as its sha.
async function gitBlobSha(bytes: Buffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
  return Buffer.from(digest).toString("hex");
}

// Reads a response body, giving up (null) once it passes `limit` bytes instead of downloading the rest.
async function readCapped(res: Response, limit: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// raw.githubusercontent.com does not count against the REST API rate limit. Private repos (with a visitor's token)
// are read through the API instead, which every kind of GitHub token can use.
export async function getFiles(
  { owner, repo }: RepoRef,
  ref: string,
  entries: TreeEntry[],
  token?: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    entries
      .filter((e) => e.size <= MAX_FILE_BYTES)
      .map(async (e) => {
        const path = e.path.split("/").map(encodeURIComponent).join("/");
        const url = token
          ? `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
          : `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path}`;
        const res = await fetchRetry(url, token ? { headers: headers(token, "application/vnd.github.raw"), cache: "no-store" } : { cache: "no-store" });
        if (res.ok) out[e.path] = await res.text();
      }),
  );
  return out;
}

// Latest stable release that actually ships files; falls back to a pre-release with files.
export async function getLatestRelease({ owner, repo }: RepoRef, token?: string): Promise<any | null> {
  const releases = await gh<any[]>(`/repos/${owner}/${repo}/releases?per_page=10`, token).catch((e) => {
    if (e instanceof GitHubError && e.status === 404) return [];
    throw e;
  });
  const published = releases.filter((r) => !r.draft);
  return (
    published.find((r) => !r.prerelease && r.assets?.length) ??
    published.find((r) => r.assets?.length) ??
    published.find((r) => !r.prerelease) ??
    null
  );
}

// The people who've committed the most to a public repo, most first, without bots. GitHub counts commits on the
// default branch only, and refuses repos whose history is too big to count (it answers 403); that, an empty repo
// (204) or a missing one comes back as no one, so the page simply leaves the list out.
export type Contributor = { login: string; avatar: string; url: string; commits: number };
export async function getContributors({ owner, repo }: RepoRef, max = 10): Promise<Contributor[]> {
  const res = await fetchRetry(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=${Math.min(100, max + 8)}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok || res.status === 204) return [];
  const list = (await res.json().catch(() => [])) as { login?: string; type?: string; avatar_url?: string; html_url?: string; contributions?: number }[];
  return (Array.isArray(list) ? list : [])
    .filter((c) => c.login && c.type !== "Bot" && !/\[bot\]$|-bot$/i.test(c.login))
    .slice(0, max)
    .map((c) => ({ login: c.login!, avatar: c.avatar_url ?? "", url: c.html_url ?? `https://github.com/${c.login}`, commits: c.contributions ?? 0 }));
}

// Words that mark giveaway, cracking and jailbreak repos (the usual bait in star-farmed, often malicious repos),
// and adult or gambling content, which doesn't belong on a public shelf.
const BAIT = /\b(free|crack(ed)?|keygen|cheat|hack(ed)?|uncensored|jailbreak|bypass|unlimited|zero ?cost|giveaway|airdrop|exploit|spoofer|injector|unlock(er)?|nsfw|porn|nude|hentai|adult|casino|betting|gambl\w*)\b|zerocost/i;

type SearchItem = {
  full_name: string;
  description: string | null;
  license: { spdx_id: string } | null;
  forks_count: number;
  open_issues_count: number;
  owner: { login: string; type: "User" | "Organization" };
  language: string | null;
  topics?: string[];
};

// Reading material rather than software: awesome lists, courses, guides and prompt collections have nothing to set up.
const NOT_SOFTWARE = /^(awesome(-list)?|tutorials?|course|courses|education|learning|learning-resources|interview|interview-questions|roadmap|books?|cheatsheet|prompts?|system-prompts?|guide|guides|study)$/;
const isSoftware = (r: SearchItem) =>
  Boolean(r.language) && !/(^|\/)awesome[-_]|for-beginners/i.test(r.full_name) && !(r.topics ?? []).some((t) => NOT_SOFTWARE.test(t));

// Stars on a brand-new repo can be bought; an established owner can't. Fake-star and malware campaigns use fresh
// accounts, so the owner has to be at least a year old, and a person needs some following.
async function trustedOwner(login: string): Promise<boolean> {
  try {
    const u = await gh<{ type: string; created_at: string; followers: number }>(`/users/${encodeURIComponent(login)}`);
    const years = (Date.now() - Date.parse(u.created_at)) / (365 * 864e5);
    return years >= 1 && (u.type === "Organization" || u.followers >= 20);
  } catch {
    return false;
  }
}

// Only repos that look like real projects pass: a description and a license, some use (issues or forks), no bait
// words, and a trusted owner. `skip` drops repos before the owner check (which costs an API call each).
async function pickReal(items: SearchItem[], picked: string[], seen: Set<string>, limit: number, skip?: (fullName: string) => Promise<boolean>) {
  for (const r of items) {
    if (picked.length >= limit || seen.has(r.full_name)) continue;
    seen.add(r.full_name);
    if (!r.description?.trim() || !r.license || r.license.spdx_id === "NOASSERTION") continue;
    if (r.open_issues_count < 1 && r.forks_count < 20) continue;
    if (BAIT.test(`${r.full_name} ${r.description}`)) continue;
    if (skip && (await skip(r.full_name))) continue;
    if (!(await trustedOwner(r.owner.login))) continue;
    picked.push(r.full_name);
  }
}

const search = (q: string, page = 1) =>
  gh<{ items: SearchItem[] }>(`/search/repositories?q=${encodeURIComponent(`${q} fork:false archived:false`)}&sort=stars&order=desc&per_page=50&page=${page}`);

// GitHub has no API for its Trending page. The closest official signal: new repos gathering stars fast, in two
// windows so this week's breakouts and last month's steady climbers both show up.
export async function risingRepos(limit = 30): Promise<string[]> {
  const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const q of [`created:>${day(7)} stars:>150`, `created:>${day(30)} stars:>800`]) await pickReal((await search(q)).items, picked, seen, limit);
  return picked;
}

// Established, well-starred repos with any of these GitHub topics that `skip` says aren't on the shelf yet,
// most stars first. Fills the lists (lib/lists.ts) with the best-known projects, not only what people looked up.
export async function topicRepos(topics: string[], limit: number, skip: (fullName: string) => Promise<boolean>, minStars = 1000): Promise<string[]> {
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const t of topics) {
    // Top repos are on the shelf after a few runs, so look further down the list until enough new ones turn up.
    for (let page = 1; page <= 3 && picked.length < limit; page++) {
      const { items } = await search(`topic:${t} stars:>${minStars}`, page);
      await pickReal(items.filter(isSoftware), picked, seen, limit, skip);
      if (items.length < 50) break;
    }
  }
  return picked;
}
