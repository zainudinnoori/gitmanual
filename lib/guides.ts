import type { TreeEntry } from "./github";

export type SetupDoc = { path: string; label: string };
export type SetupScript = { path: string; run: string; windows: boolean };

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

const DOC_EXT = /\.(md|mdx|markdown|rst|txt)$|^[^.]+$/i;
const DOC_DIRS = /^(docs?|documentation|\.github|guides?)\/[^/]+$/i;

const SCRIPT = /^((scripts?|bin|tools)\/)?(setup|install|bootstrap|init)([-_.][\w-]+)?(\.(sh|bash|ps1|bat|cmd|command))?$/i;

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

export function findSetupScripts(entries: TreeEntry[]): SetupScript[] {
  return entries
    .filter((e) => {
      if (!SCRIPT.test(e.path)) return false;
      const ext = /\.(sh|bash|ps1|bat|cmd|command)$/i.test(e.path);
      // Extension-less files only count inside script folders (bin/setup), so INSTALL docs don't.
      return ext || (/^(scripts?|bin|tools)\/[^/.]+$/i.test(e.path) && !/\.\w+$/.test(e.path));
    })
    .slice(0, 5)
    .map((e) => {
      const windows = /\.(ps1|bat|cmd)$/i.test(e.path);
      const run = /\.ps1$/i.test(e.path)
        ? `powershell -ExecutionPolicy Bypass -File .\\${e.path.replace(/\//g, "\\")}`
        : /\.(bat|cmd)$/i.test(e.path)
          ? `.\\${e.path.replace(/\//g, "\\")}`
          : /\.(sh|bash|command)$/i.test(e.path)
            ? `bash ${e.path}`
            : `./${e.path}`;
      return { path: e.path, run, windows };
    });
}

// The first README link that is clearly the project's documentation.
export function findDocsLink(readme: string | undefined): string | null {
  if (!readme) return null;
  for (const m of readme.matchAll(/\[([^\]]{2,60})\]\((https?:\/\/[^)\s]+)\)/g)) {
    const [, text, href] = m;
    if (/github\.com|shields\.io|badge|img\./i.test(href)) continue;
    if (/\b(docs?|documentation|user guide|manual|website|homepage)\b/i.test(text)) return href;
  }
  return null;
}
