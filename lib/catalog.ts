import { BadRequest } from "./api";
import type { Caller } from "./apikeys";
import { alternativesFor, browseRepos, ensureFacets, facetRepos, type RepoCard } from "./db";
import { facetsOf, topicsOf } from "./facets";
import { fitCheck } from "./fit";
import { parseRepoUrl } from "./github";
import { LISTS, listBySlug, MIN_LIST, type List } from "./lists";
import { loadForCaller, SITE } from "./lookup";
import { OS_LABEL, OS_LIST, type OS } from "./os";

// The shelf, the lists and similar repos in the API's shape, for /api/v1 and the MCP server. All of it is read from
// the database (no GitHub calls), so none of it counts toward a limit, except alternatives for a repo that isn't on
// the shelf yet, which reads that repo first. Documented on /developers.

export type RepoSummary = {
  repo: string;
  description: string | null;
  stars: number;
  language: string | null;
  difficulty: string;
  gotItRunning: { worked: number; stuck: number };
  risingThisWeek: boolean;
  manual: string;
  analyzedAt: string;
};

const WEEK = 7 * 864e5;

export const summary = (r: RepoCard): RepoSummary => ({
  repo: r.fullName,
  description: r.description,
  stars: r.stars,
  language: r.language,
  difficulty: r.difficulty,
  gotItRunning: { worked: r.worked, stuck: r.stuck },
  risingThisWeek: Boolean(r.risingAt && Date.now() - r.risingAt < WEEK),
  manual: `${SITE}/${r.fullName}`,
  analyzedAt: new Date(r.analyzedAt).toISOString(),
});

export const SORTS = ["stars", "recent", "popular", "worked"] as const;
export const DIFFICULTIES = ["Easy", "Moderate", "Involved"] as const;
export const MAX_PER_PAGE = 50;

export type SearchQuery = {
  q?: string;
  os?: OS;
  language?: string;
  difficulty?: (typeof DIFFICULTIES)[number];
  minStars?: number;
  sort?: (typeof SORTS)[number];
  rising?: boolean;
  page?: number;
  perPage?: number;
};

export async function searchShelf(s: SearchQuery) {
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, s.perPage ?? 20));
  const page = Math.max(1, s.page ?? 1);
  if (s.os) await ensureFacets();
  const { repos, total } = await browseRepos({
    q: s.q?.trim().slice(0, 80) || undefined,
    os: s.os,
    language: s.language,
    difficulty: s.difficulty,
    minStars: s.minStars,
    sort: s.sort ?? "stars",
    rising: s.rising,
    page,
    perPage,
  });
  return { total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)), results: repos.map(summary) };
}

const listInfo = (l: List, count: number) => ({
  slug: l.slug,
  title: l.title,
  theme: l.theme,
  os: l.os,
  repos: count,
  url: `${SITE}/lists/${l.slug}`,
});

// Every list, with how many repos are on it. Lists with fewer than MIN_LIST repos are still filling up.
export async function allLists() {
  await ensureFacets();
  const counts = await Promise.all(LISTS.map((l) => facetRepos({ all: l.all, any: l.any, limit: 60 }).then((r) => r.length)));
  return LISTS.map((l, i) => ({ ...listInfo(l, counts[i]), ready: counts[i] >= MIN_LIST }));
}

export async function oneList(slug: string) {
  const l = listBySlug(slug);
  if (!l) return null;
  await ensureFacets();
  const repos = await facetRepos({ all: l.all, any: l.any, limit: 60 });
  return { ...listInfo(l, repos.length), intro: l.intro, results: repos.map(summary) };
}

// Similar repos (shared GitHub topics, weighted by rarity) that run on `os`, with whether the repo itself does.
export async function alternatives(repo: string, os: OS, headers: Headers, caller?: Caller) {
  const ref = parseRepoUrl(repo);
  if (!ref) throw new BadRequest(`"${repo}" isn't a GitHub repo. Use owner/repo, e.g. ollama/ollama.`);
  const { data } = await loadForCaller(ref, headers, caller);
  const fit = fitCheck(data.analysis, data.install, os, null, data.meta.archived);
  const found = await alternativesFor(data.meta.fullName.toLowerCase(), os, topicsOf(facetsOf(data)), 5);
  return {
    repo: data.meta.fullName,
    os,
    runsOn: { verdict: fit.status, headline: fit.headline },
    alternatives: found.map((a) => ({ repo: a.fullName, description: a.description, stars: a.stars, manual: `${SITE}/${a.fullName}` })),
    private: Boolean(data.meta.private),
  };
}

export const OS_HELP = `${OS_LIST.join(", ")} (${OS_LIST.map((o) => OS_LABEL[o]).join(", ")})`;
