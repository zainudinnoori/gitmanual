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

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "gitsetup",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) throw new GitHubError("Repository not found (or it is private).", 404);
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

export async function getRepoMeta({ owner, repo }: RepoRef): Promise<RepoMeta> {
  const r = await gh<any>(`/repos/${owner}/${repo}`);
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
    homepage: r.homepage ? (/^https?:\/\//.test(r.homepage) ? r.homepage : `https://${r.homepage}`) : null,
  };
}

export async function getTree({ owner, repo }: RepoRef, ref: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const t = await gh<any>(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const entries: TreeEntry[] = (t.tree ?? [])
    .filter((e: any) => e.type === "blob")
    .map((e: any) => ({ path: e.path as string, size: (e.size as number) ?? 0 }));
  return { entries, truncated: Boolean(t.truncated) };
}

// raw.githubusercontent.com does not count against the REST API rate limit.
export async function getFiles(
  { owner, repo }: RepoRef,
  ref: string,
  entries: TreeEntry[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    entries
      .filter((e) => e.size <= MAX_FILE_BYTES)
      .map(async (e) => {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${e.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) out[e.path] = await res.text();
      }),
  );
  return out;
}

// Latest stable release that actually ships files; falls back to a pre-release with files.
export async function getLatestRelease({ owner, repo }: RepoRef): Promise<any | null> {
  const releases = await gh<any[]>(`/repos/${owner}/${repo}/releases?per_page=10`).catch((e) => {
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
