import { analyze, presentPaths, selectFiles, type Analysis } from "./detect";
import { CACHE_MS, countView, getCached, repoKey, saveRepo } from "./db";
import { getFiles, getLatestRelease, getRepoMeta, getTree, type RepoMeta, type RepoRef } from "./github";
import { findDocsLink, findSetupDocs, findSetupScripts, type Guides, type SetupDoc } from "./guides";
import { parseRelease, readmeInstallCommands, type InstallOptions } from "./install";
import { OS_LIST } from "./os";

export type RepoData = {
  meta: RepoMeta & { branch: string; fileCount: number; treeTruncated: boolean };
  analysis: Analysis;
  install: InstallOptions;
  guides: Guides;
  files: Record<string, string>;
};

export type Loaded = { key: string; data: RepoData; analyzedAt: number; cached: boolean; stale?: boolean };

// Repos analyzed in the last 12 hours come straight from the database: instant, and no GitHub calls.
export async function loadRepo(ref: RepoRef, opts: { fresh?: boolean; view?: boolean } = {}): Promise<Loaded> {
  const lookup = repoKey(ref.owner, ref.repo, ref.ref);
  const cached = await getCached(lookup);
  if (cached && !opts.fresh && Date.now() - cached.analyzedAt < CACHE_MS) {
    if (opts.view) await countView(lookup);
    return { key: lookup, data: cached.data as RepoData, analyzedAt: cached.analyzedAt, cached: true };
  }

  try {
    const data = await analyzeRepo(ref);
    const [owner, name] = data.meta.fullName.split("/");
    const key = repoKey(owner, name, ref.ref);
    const { meta, analysis } = data;
    const analyzedAt = await saveRepo(
      key,
      { fullName: meta.fullName, description: meta.description, stars: meta.stars, language: meta.language, difficulty: analysis.difficulty.label },
      data,
    );
    if (opts.view) await countView(key);
    return { key, data, analyzedAt, cached: false };
  } catch (err) {
    // GitHub is down or rate-limited: an older saved copy beats an error page.
    if (!cached) throw err;
    if (opts.view) await countView(lookup);
    return { key: lookup, data: cached.data as RepoData, analyzedAt: cached.analyzedAt, cached: true, stale: true };
  }
}

async function analyzeRepo(ref: RepoRef): Promise<RepoData> {
  const meta = await getRepoMeta(ref);
  const branch = ref.ref ?? meta.defaultBranch;
  const [{ entries, truncated }, rawRelease] = await Promise.all([getTree(ref, branch), getLatestRelease(ref)]);
  const docs = findSetupDocs(entries);
  const docEntry = docs[0] && entries.find((e) => e.path === docs[0].path);
  const files = await getFiles(ref, branch, [...selectFiles(entries), ...(docEntry ? [docEntry] : [])]);
  const [owner, name] = meta.fullName.split("/");
  const analysis = analyze({ owner, repo: name }, files, presentPaths(entries), entries.map((e) => e.path));

  const readme = Object.entries(files).find(([p]) => /^readme(\.\w+)?$/i.test(p))?.[1];
  const release = parseRelease(rawRelease);
  const commands = readmeInstallCommands(readme);
  const install: InstallOptions = {
    release,
    commands,
    platforms: OS_LIST.filter((os) => release?.assets.some((a) => a.os === os) || commands.some((c) => c.os.includes(os))),
  };
  const docsLink = findDocsLink(readme);
  const guides: Guides = {
    website: meta.homepage,
    docs: docsLink && docsLink !== meta.homepage ? docsLink : null,
    doc: usableDoc(docs[0], files),
    otherDocs: docs.slice(1),
    scripts: findSetupScripts(entries),
    devcontainer: entries.some((e) => e.path === ".devcontainer/devcontainer.json" || e.path === ".devcontainer.json"),
  };

  return { meta: { ...meta, branch, fileCount: entries.length, treeTruncated: truncated }, analysis, install, guides, files };
}

// A CONTRIBUTING file only counts as a setup guide when it actually has a setup section.
function usableDoc(doc: SetupDoc | undefined, files: Record<string, string>): Guides["doc"] {
  const text = doc && files[doc.path];
  if (!doc || !text) return null;
  if (doc.label === "Contributing guide") {
    if (!/^#{1,4}\s.*\b(set ?up|install|getting started|prerequisites|development environment|build(ing)?|local development)\b/im.test(text)) return null;
    return { ...doc, label: "Development setup", markdown: text.slice(0, 20000) };
  }
  return { ...doc, markdown: text.slice(0, 20000) };
}
