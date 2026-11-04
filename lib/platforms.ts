import type { OS } from "./os";

// What the maintainers say about supported systems, quoted so the page can show where a "no" comes from.
export type Platforms = { unsupported: OS[]; quote: string } | null;

const MAC = String.raw`(?:mac ?os|os ?x|macs?|apple silicon|apple m[1-5])`;

const RULES: [RegExp, OS[]][] = [
  // "macOS only", "only works on macOS", "a macOS CLI". Not "requires macOS 12": that's a version.
  [new RegExp(String.raw`\b${MAC}[- ]only\b`, "i"), ["windows", "linux"]],
  [new RegExp(String.raw`\bonly (?:works|runs|available|supported|supports)? ?(?:on|for) ${MAC}\b`, "i"), ["windows", "linux"]],
  [/^(?:\S+ is )?an? (?:native )?mac ?os (?:app|application|cli|tool|menu ?bar app|utility)\b/i, ["windows", "linux"]],
  [/\bapple silicon only\b/i, ["windows", "linux"]],
  // "Linux only", "Windows is not supported", "doesn't support Windows"
  [/\blinux[- ]only\b|\bonly (?:works|runs|supported) on linux\b/i, ["mac", "windows"]],
  [/\bwindows (?:is )?(?:not|isn['’]t) (?:yet )?supported\b|\bdoes(?:n['’]t| not) (?:support|work on|run on) windows\b|\bno windows support\b/i, ["windows"]],
  [/\bmac ?os (?:is )?(?:not|isn['’]t) (?:yet )?supported\b|\bdoes(?:n['’]t| not) (?:support|work on|run on) mac ?os\b/i, ["mac"]],
  [/\bwindows[- ]only\b|\bonly (?:works|runs|supported) on windows\b/i, ["mac", "linux"]],
];

export function declaredPlatforms(description: string | null, readme: string | undefined): Platforms {
  // Only the description and the README's intro (before the first ## section) say what the project is;
  // later sections mention "Linux-only" features or per-OS requirements, which aren't platform limits.
  const intro = (readme ?? "").split(/^##\s/m)[0];
  const text = intro
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ");
  for (const source of [description ?? "", text]) {
    for (const sentence of source.split(/(?<=[.!?])\s+|\n+/)) {
      // Bullet points list features ("- Screen off (Linux-only)"), not where the project runs.
      if (/^\s*([-*+]|\d+\.)\s/.test(sentence)) continue;
      for (const [re, unsupported] of RULES) {
        if (re.test(sentence)) return { unsupported, quote: clip(sentence.trim().replace(/[#*_`>]/g, ""), 200) };
      }
    }
  }
  return null;
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, s.lastIndexOf(" ", n))}…`;
}

// Whether the README or description talks about a system at all, e.g. before assuming Homebrew means Linux too.
export function mentions(text: string, os: OS): boolean {
  if (os === "linux") return /\blinux|ubuntu|debian|fedora|arch linux|linuxbrew\b/i.test(text);
  if (os === "windows") return /\bwindows|winget|scoop|chocolatey\b/i.test(text);
  return /\bmac ?os|os ?x|homebrew|apple\b/i.test(text);
}
