// Checks on a chat answer (app/api/chat, app/chat.tsx). They make an answer easier to trust, not safe: a harmful
// command can be cited perfectly, so command risks and citations are checked separately and neither vouches for
// the other. Plain functions, so the page and the server share them.

export type Risk = { kind: string; label: string };

const RISKS: [RegExp, Risk][] = [
  [/\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(-E\s+)?(ba|z|da|k|fi)?sh\b/i, { kind: "pipe", label: "Downloads a script and runs it immediately" }],
  [/\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(python3?|node|perl|ruby)\b/i, { kind: "pipe", label: "Downloads a script and runs it immediately" }],
  [/\b(ba|z)?sh\s+(-c\s+["']?)?(<\(|\$\()\s*(curl|wget)\b/i, { kind: "pipe", label: "Downloads a script and runs it immediately" }],
  [/\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*(iex|Invoke-Expression)\b/i, { kind: "pipe", label: "Downloads a script and runs it immediately" }],
  [/\b(iex|Invoke-Expression)\b\s*\(\s*(\(\s*)?(New-Object|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b/i, { kind: "pipe", label: "Downloads a script and runs it immediately" }],
  [/(^|[;&|(]\s*|\s)sudo\s/m, { kind: "sudo", label: "Runs with administrator rights" }],
  [/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/, { kind: "delete", label: "Deletes folders and everything in them" }],
  [/\bRemove-Item\b[^\n]*-Recurse\b/i, { kind: "delete", label: "Deletes folders and everything in them" }],
  [/(>>?|\btee\s+(-a\s+)?)\s*["']?(~|\$HOME|\$\{HOME\})?\/?[^\s"']*\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)\b/i, { kind: "profile", label: "Changes your shell startup file" }],
  [/\b(Add-Content|Set-Content|Out-File)\b[^\n]*\$PROFILE\b|>>?\s*\$PROFILE\b/i, { kind: "profile", label: "Changes your shell startup file" }],
  [/\bchmod\s+(-R\s+)?(0?777|a\+rwx)\b/, { kind: "permissions", label: "Lets every user change these files" }],
  [/\b(mkfs(\.\w+)?|dd\s+[^\n]*\bof=\/dev\/|diskutil\s+(erase|partition)\w*|format\s+[a-z]:)/i, { kind: "disk", label: "Can erase a disk" }],
  [/\bSet-ExecutionPolicy\b/i, { kind: "policy", label: "Changes Windows' rule for running scripts" }],
];

// What's risky about a command, each kind once. Empty when nothing matched, which doesn't mean it's safe.
export function commandRisks(command: string): Risk[] {
  const found = new Map<string, Risk>();
  for (const [pattern, risk] of RISKS) if (pattern.test(command) && !found.has(risk.kind)) found.set(risk.kind, risk);
  return [...found.values()];
}

// Root files people name without a folder. Anything else needs a "/" to count as a path, so `Next.js` or
// `node.js` in a sentence aren't taken for files.
const ROOT_FILE = /^(\.?[\w.-]*\.(md|mdx|rst|txt|json|jsonc|toml|ya?ml|lock|cfg|ini|xml|gradle|mod|sum|nix|env|example|sample|template|ps1|sh|bat|cmd)|Makefile|Dockerfile|Containerfile|Procfile|Justfile|Gemfile|Rakefile|Pipfile|Vagrantfile|\.\w[\w.-]*)$/i;
// docs/install.md, src/, a/b/ — a folder counts when it ends in a slash.
const PATHLIKE = /^[\w@.+-]+((\/[\w@.+-]+)+\/?|\/)$/;

// Paths an answer names in `backticks` outside code blocks: `package.json`, `docs/install.md`, `src/main.rs:12`.
export function citedPaths(markdown: string): string[] {
  const prose = markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");
  const out = new Set<string>();
  for (const m of prose.matchAll(/`([^`\n]{1,200})`/g)) {
    const raw = m[1].trim().replace(/^\.\//, "").replace(/:\d+(-\d+)?$/, "");
    if (/\s/.test(raw) || raw.startsWith("-") || /^https?:/.test(raw)) continue;
    if (PATHLIKE.test(raw) || ROOT_FILE.test(raw)) out.add(raw.replace(/\/$/, ""));
  }
  return [...out];
}

export type Citations = {
  verified: string[]; // among the files Claude actually had
  notRead: string[]; // in the repo, but Claude never saw it
  missing: string[]; // not a file in the repo at this commit
};

// Files and folders setup creates rather than finds (`cp .env.example .env`, `npm install`), so their absence from
// the repo says nothing about the answer.
const CREATED = /^(\.env(\.[\w-]+)?|node_modules|dist|build|out|target|\.venv|venv|env|__pycache__|\.next|vendor)(\/|$)/;

// Whether each path an answer names is one Claude really read. A bare file name counts when exactly one file it
// read has that name, like `install.md` for docs/install.md.
export function checkCitations(markdown: string, read: Iterable<string>, repoPaths: Iterable<string>): Citations {
  const had = new Set(read);
  const all = new Set(repoPaths);
  // A name the answer's own commands use (`rustlings init` then `cd rustlings/`) is something setup makes or acts
  // on, not a source it cites.
  const commands = [...markdown.matchAll(/^(```|~~~)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm)].map((m) => m[2]).join("\n");
  const out: Citations = { verified: [], notRead: [], missing: [] };
  for (const path of citedPaths(markdown)) {
    const named = (p: string) => p === path || p.endsWith(`/${path}`);
    if (had.has(path) || [...had].filter(named).length === 1) out.verified.push(path);
    else if (all.has(path) || [...all].some(named) || [...all].some((p) => p.startsWith(`${path}/`))) out.notRead.push(path);
    else if (!CREATED.test(path) && !commands.includes(path)) out.missing.push(path);
  }
  return out;
}
