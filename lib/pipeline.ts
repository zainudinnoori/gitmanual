import { analyze, presentPaths, selectFiles, type Analysis } from "./detect";
import { CACHE_MS, countView, getCached, repoKey, saveRepo } from "./db";
import { getFiles, getLatestRelease, getRepoMeta, getTree, type RepoMeta, type RepoRef } from "./github";
import { findDocsLink, findDownloadPage, findSetupDocs, findSetupScripts, type Guides, type SetupDoc } from "./guides";
import { parseRelease, readmeInstallCommands, type InstallOptions } from "./install";
import { OS_LIST } from "./os";
import { declaredPlatforms, mentions } from "./platforms";

// Bump when the analysis output changes shape or rules, so saved copies are re-analyzed instead of shown.
const VERSION = 12;

export type RepoData = {
  version: number;
  meta: RepoMeta & { branch: string; fileCount: number; treeTruncated: boolean };
  analysis: Analysis;
  install: InstallOptions;
  guides: Guides;
  files: Record<string, string>;
};

export type Loaded = { key: string; data: RepoData; analyzedAt: number; cached: boolean; stale?: boolean };

// Repos analyzed in the last 12 hours come straight from the database: instant, and no GitHub calls.
// gate runs only when the repo has to be read from GitHub (see lib/limit.ts); it throws to refuse.
export async function loadRepo(ref: RepoRef, opts: { fresh?: boolean; view?: boolean; gate?: () => Promise<void> } = {}): Promise<Loaded> {
  const lookup = repoKey(ref.owner, ref.repo, ref.ref);
  const saved = await getCached(lookup);
  const cached = saved && (saved.data as RepoData).version === VERSION ? saved : null;
  if (cached && !opts.fresh && Date.now() - cached.analyzedAt < CACHE_MS) {
    if (opts.view) await countView(lookup);
    return { key: lookup, data: cached.data as RepoData, analyzedAt: cached.analyzedAt, cached: true };
  }

  try {
    await opts.gate?.();
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
    // GitHub is down or rate-limited, or the visitor is over a limit: an older saved copy beats an error page.
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
  const analysis = analyze({ owner, repo: name }, files, presentPaths(entries), entries.map((e) => e.path), meta.language, meta.description);

  const readme = Object.entries(files).find(([p]) => /^readme(\.\w+)?$/i.test(p))?.[1];
  const release = parseRelease(rawRelease);
  const text = `${meta.description ?? ""}\n${readme ?? ""}`;
  const declared = declaredPlatforms(meta.description, readme);
  // A ready-made download for a system beats a sentence saying it's unsupported (the README may be out of date).
  if (declared) declared.unsupported = declared.unsupported.filter((os) => !release?.assets.some((a) => a.os === os));
  const commands = readmeInstallCommands(readme, { owner, name })
    .filter((c) => !/compose/.test(c.command) || composeRunsApp(files, readme, name))
    .map((c) => ({
      ...c,
      // Homebrew, Nix and install scripts also run on Linux, but only count there when the project mentions Linux.
      os: c.os.filter(
        (os) =>
          !declared?.unsupported.includes(os) &&
          (os !== "linux" || !/^(Homebrew|Nix|install script)$/.test(c.method) || mentions(text, "linux") || Boolean(release?.assets.some((a) => a.os === "linux"))),
      ),
    }))
    .filter((c) => c.os.length);
  const downloadPage = findDownloadPage(readme, { name, website: meta.homepage });
  const install: InstallOptions = {
    release,
    commands,
    declared: declared?.unsupported.length ? declared : null,
    platforms: OS_LIST.filter(
      (os) =>
        release?.assets.some((a) => a.os === os) || commands.some((c) => c.kind === "app" && c.os.includes(os)) || downloadPage?.platforms.includes(os),
    ),
    downloadPage,
  };
  const docsLink = findDocsLink(readme, { name, website: meta.homepage });
  const guides: Guides = {
    website: meta.homepage,
    docs: docsLink && docsLink !== meta.homepage ? docsLink : null,
    doc: usableDoc(docs[0], files),
    otherDocs: docs.slice(1),
    scripts: findSetupScripts(entries),
    devcontainer: entries.some((e) => e.path === ".devcontainer/devcontainer.json" || e.path === ".devcontainer.json"),
  };

  return { version: VERSION, meta: { ...meta, branch, fileCount: entries.length, treeTruncated: truncated }, analysis, install, guides, files };
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

// "docker compose up" starts the app itself only if a compose file builds or pulls this project, not just its databases.
function composeRunsApp(files: Record<string, string>, readme: string | undefined, name: string): boolean {
  const own = (text: string | undefined) =>
    Boolean(text) && (/^\s*build:/m.test(text!) || new RegExp(`^\\s*image:.*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "im").test(text!));
  const compose = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].map((p) => files[p]).find(Boolean);
  return own(compose) || own(readme);
}
