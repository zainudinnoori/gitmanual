import type { OS } from "./os";
import type { TreeEntry } from "./github";

export type SetupDoc = { path: string; label: string };
export type SetupScript = { path: string; run: string | null; windows: boolean }; // run is null when we can't tell the interpreter

export type Guides = {
  website: string | null;
  docs: string | null; // documentation site linked from the README
  doc: (SetupDoc & { markdown: string }) | null; // the best setup guide in the repo, with its text
  otherDocs: SetupDoc[];
  scripts: SetupScript[];
  devcontainer: boolean;
};

// Ordered by how directly the file explains setup.
const DOC_PATTERNS: [RegExp, string][] = [
  [/(^|\/)(install(ation|ing)?)(\.\w+)?$/i, "Install guide"],
  [/(^|\/)(setup|set-up)(\.\w+)?$/i, "Setup guide"],
  [/(^|\/)(getting[-_ ]?started|quick[-_ ]?start)(\.\w+)?$/i, "Getting started"],
  [/(^|\/)(build(ing)?|compil(e|ing))(\.\w+)?$/i, "Build guide"],
  [/(^|\/)(development|developing|hacking|dev[-_]setup|local[-_]development)(\.\w+)?$/i, "Development setup"],
  [/(^|\/)contributing(\.\w+)?$/i, "Contributing guide"],
];

// Extension-less docs are the GNU-style upper-case INSTALL / BUILDING; a lower-case "install" is usually a script.
const DOC_EXT = /\.(md|mdx|markdown|rst|txt)$|^[A-Z_-]+$/;
const DOC_DIRS = /^(docs?|documentation|\.github|guides?)\/[^/]+$/i;

const SCRIPT = /^((scripts?|bin|tools)\/)?(setup|install|bootstrap|init)([-_.][\w-]+)?(\.(sh|bash|ps1|bat|cmd|command))?$/i;
// Root launchers some apps are started with (AUTOMATIC1111's webui.sh / webui-user.bat).
const LAUNCHER = /^(start|run|launch|webui)([-_][\w-]+)?\.(sh|bat|cmd|ps1|command)$/i;

function docScore(path: string): number {
  const name = path.split("/").pop()!;
  if (!DOC_EXT.test(name)) return -1;
  if (path.includes("/") && !DOC_DIRS.test(path)) return -1;
  const i = DOC_PATTERNS.findIndex(([re]) => re.test(name));
  if (i === -1) return -1;
  // Root files beat docs/ files of the same kind.
  return (DOC_PATTERNS.length - i) * 2 + (path.includes("/") ? 0 : 1);
}

export function findSetupDocs(entries: TreeEntry[]): SetupDoc[] {
  return entries
    .map((e) => ({ e, s: docScore(e.path) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map(({ e }) => ({ path: e.path, label: DOC_PATTERNS.find(([re]) => re.test(e.path.split("/").pop()!))![1] }));
}

function rank(path: string): number {
  const name = path.split("/").pop()!;
  return (path.includes("/") ? 2 : 0) + (/^[a-z]+\.\w+$/i.test(name) || /^[a-z]+$/i.test(name) ? 0 : 1);
}

export function findSetupScripts(entries: TreeEntry[]): SetupScript[] {
  return entries
    .filter((e) => {
      if (LAUNCHER.test(e.path)) return true;
      if (!SCRIPT.test(e.path)) return false;
      const ext = /\.(sh|bash|ps1|bat|cmd|command)$/i.test(e.path);
      // Extension-less files count inside script folders (bin/setup) or as a lower-case root file (install); INSTALL docs don't.
      return ext || /^(scripts?|bin|tools)\/[^/.]+$/i.test(e.path) || /^[a-z]+$/.test(e.path);
    })
    // Plain names (webui.sh, setup.sh) before variants (webui-macos-env.sh), root files before nested ones.
    .sort((a, b) => rank(a.path) - rank(b.path))
    .slice(0, 5)
    .map((e) => {
      const windows = /\.(ps1|bat|cmd)$/i.test(e.path);
      const run = /\.ps1$/i.test(e.path)
        ? `powershell -ExecutionPolicy Bypass -File .\\${e.path.replace(/\//g, "\\")}`
        : /\.(bat|cmd)$/i.test(e.path)
          ? `.\\${e.path.replace(/\//g, "\\")}`
          : /\.(sh|bash|command)$/i.test(e.path)
            ? `bash ${e.path}`
            : null;
      return { path: e.path, run, windows };
    });
}

// The first README link that is clearly this project's documentation (not, say, a dependency's docs).
export function findDocsLink(readme: string | undefined, repo: { name: string; website: string | null }): string | null {
  if (!readme) return null;
  const name = repo.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const site = repo.website ? hostOf(repo.website) : null;
  for (const m of readme.matchAll(/\[([^\]]{2,60})\]\((https?:\/\/[^)\s]+)\)/g)) {
    const [, text, href] = m;
    if (/github\.com|shields\.io|badge|img\.|\.(txt|png|svg|jpg|gif)(\?|#|$)/i.test(href)) continue;
    if (!/\b(docs?|documentation|user guide|manual)\b/i.test(text)) continue;
    const host = hostOf(href);
    if (!host) continue;
    const ours = host.replace(/[^a-z0-9]/g, "").includes(name) || (site !== null && (host === site || host.endsWith(`.${site}`)));
    if (!ours) continue;
    // On a shared host the link must be the docs home (/docs, /en/latest), not a topic page elsewhere on the site (FastAPI's /async/).
    const path = new URL(href).pathname.replace(/\/$/, "");
    const docsHost = /^(docs?|documentation|wiki)\./.test(host);
    if (!docsHost && !/^\/(docs?|documentation|guide|guides|manual|learn|wiki)(\/|$)|^\/(en\/)?(latest|stable)(\/|$)|^$/.test(path)) continue;
    // The website itself, maybe with a #fragment, isn't a separate docs link.
    if (repo.website && href.split("#")[0].replace(/\/$/, "") === repo.website.replace(/\/$/, "")) continue;
    return href;
  }
  return null;
}

// Systems a download link is for, written the ways READMEs do: ".dmg", "Apple Silicon", "AppImage"…
const DOWNLOAD_OS: [OS, RegExp][] = [
  ["mac", /\bmac(?:os)?\b|\bos ?x\b|apple silicon|\.dmg\b/i],
  ["windows", /\bwindows\b|\bwin(?:32|64)\b|\.exe\b|\.msi\b/i],
  ["linux", /\blinux\b|ubuntu|debian|fedora|\.deb\b|\.rpm\b|appimage|flatpak/i],
];
const systemsIn = (text: string): OS[] => DOWNLOAD_OS.filter(([, re]) => re.test(text)).map(([os]) => os);

export type DownloadPage = { host: string; platforms: OS[]; urls: Partial<Record<OS, string>> };

// Some projects publish their apps on their own site instead of GitHub releases (presenton.ai/download).
// A README link counts when it says "download" (or is in a list of downloads), points to the project's own
// site, and is clearly tied to systems: the link text names one ("[Mac](…)"), a parenthesis right after it
// lists them ("[Desktop App](…) (Mac, Windows & Linux)"), or it sits in a table row that names one.
// A sentence about the whole project ("available on Windows, Linux and macOS… our desktop app") doesn't count.
export function findDownloadPage(readme: string | undefined, repo: { name: string; website: string | null }): DownloadPage | null {
  if (!readme) return null;
  const name = repo.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const site = repo.website ? hostOf(repo.website) : null;
  const ours = (host: string) => host.replace(/[^a-z0-9]/g, "").includes(name) || (site !== null && (host === site || host.endsWith(`.${site}`)));
  const urls: Partial<Record<OS, string>> = {};
  let pageHost: string | null = null;
  const add = (href: string, label: string, systems: OS[]) => {
    const host = hostOf(href);
    if (!host || /(^|\.)github(usercontent)?\.com$/.test(host) || !ours(host)) return; // release files come from the API
    if (!/download/i.test(`${label} ${href}`)) return; // "installation" pages are usually developer guides, not apps
    if (pageHost && host !== pageHost) return; // one site
    pageHost ??= host;
    for (const os of systems) urls[os] ??= href;
  };

  // Tables of downloads: each <tr> names its system.
  for (const [row] of readme.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const systems = systemsIn(row.replace(/<a\b[^>]*>/gi, ""));
    for (const m of row.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) add(m[1], m[2], systems);
  }
  // Markdown links: systems from the link text, or from a parenthesis right after it.
  for (const m of readme.replace(/<tr\b[\s\S]*?<\/tr>/gi, "").matchAll(/\[([^\]]{1,80})\]\((https?:\/\/[^)\s]+)\)(?:\s*\(([^)]{3,60})\))?/g)) {
    const [, label, href, after] = m;
    const fromLabel = systemsIn(label);
    add(href, label, fromLabel.length ? fromLabel : after ? systemsIn(after) : []);
  }

  const platforms = (["mac", "windows", "linux"] as OS[]).filter((os) => urls[os]);
  return pageHost && platforms.length ? { host: pageHost, platforms, urls } : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
