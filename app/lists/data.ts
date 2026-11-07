import { cache } from "react";
import { ensureFacets, facetRepos } from "@/lib/db";
import { LISTS, MIN_LIST, type List } from "@/lib/lists";

// Every list with its repos, loaded once per request (the index, a list page and the sitemap all use it).
export const loadLists = cache(async () => {
  await ensureFacets();
  return Promise.all(LISTS.map(async (l) => ({ ...l, repos: await facetRepos({ all: l.all, any: l.any, limit: 60 }) })));
});

export const isPublished = (l: List & { repos: unknown[] }) => l.repos.length >= MIN_LIST;
