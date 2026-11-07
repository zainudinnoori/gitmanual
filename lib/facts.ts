import type { EnvVar } from "./detect";
import { compactCount } from "./format";
import type { RepoMeta } from "./github";
import type { InstallOptions } from "./install";

// "Before you start": the questions people search right after a project's name (is it free, does it cost money
// to run, is it still maintained, can I trust it), answered from what the manual already read. Each answer says
// what it's based on, and none of them claims more than the files show.

export type Tone = "yes" | "maybe" | "no";
export type Fact = { id: "free" | "ai" | "maintained" | "trust"; q: string; a: string; why: string; tone: Tone };

// The same question as people type it into a search box, for structured data and AI agents ("Is ollama free?").
const ASKED: Record<Fact["id"], (name: string) => string> = {
  free: (n) => `Is ${n} free?`,
  ai: (n) => `Does ${n} use paid AI services?`,
  maintained: (n) => `Is ${n} still maintained?`,
  trust: (n) => `Can I trust ${n}?`,
};
// Repos named for what they are ("httpie/cli", "home-assistant/core") are asked about by their owner's name.
const GENERIC = /^(cli|app|apps|core|server|client|web|api|desktop|sdk|docs|main|frontend|backend|monorepo|platform|engine|ui|mobile|android|ios|website|site)$/i;
export const projectName = (fullName: string) => {
  const [owner, repo] = fullName.split("/");
  return GENERIC.test(repo) ? owner : repo;
};
export const asked = (f: Fact, fullName: string) => ASKED[f.id](projectName(fullName));
// The answer as one sentence: the short answer, then what it's based on.
export const answered = (f: Fact) => `${f.a}. ${f.why}`;

// Licenses that let anyone use, change and share the code (OSI-approved), by GitHub's SPDX id.
const OPEN = /^(MIT|MIT-0|ISC|0BSD|Unlicense|CC0-1\.0|WTFPL|Zlib|BSL-1\.0|Apache-2\.0|BSD-[234]-Clause.*|MPL-2\.0|EPL-[12]\.0|EUPL-1\.[12]|Artistic-2\.0|(A|L)?GPL-[23]\.0.*|OSL-3\.0|PostgreSQL|NCSA|UPL-1\.0|MS-PL|MulanPSL-2\.0)$/i;
// Source-available: you can read it, but some uses (often running it as a paid service) are restricted.
const SOURCE_AVAILABLE: Record<string, string> = {
  "BUSL-1.1": "Business Source License",
  "SSPL-1.0": "Server Side Public License",
  "Elastic-2.0": "Elastic License",
};

// Paid AI APIs, matched only on settings that hold their key ("OPENAI_API_KEY", "REPLICATE_API_TOKEN"), so a name
// that merely mentions a provider ("CLAUDE_CONFIG_DIR") doesn't count. Azure OpenAI comes before OpenAI.
const AI: [RegExp, string][] = (
  [
    ["AZURE_OPENAI", "Azure OpenAI"],
    ["OPENAI", "OpenAI"],
    ["ANTHROPIC|CLAUDE", "Anthropic"],
    ["GEMINI|GOOGLE_(GENERATIVE_)?AI", "Google Gemini"],
    ["OPENROUTER", "OpenRouter"],
    ["GROQ", "Groq"],
    ["MISTRAL", "Mistral"],
    ["DEEPSEEK", "DeepSeek"],
    ["COHERE", "Cohere"],
    ["TOGETHER(_AI)?", "Together AI"],
    ["REPLICATE", "Replicate"],
    ["PERPLEXITY|PPLX", "Perplexity"],
    ["XAI|GROK", "xAI"],
    ["ELEVEN_?LABS", "ElevenLabs"],
  ] as const
).map(([p, name]) => [new RegExp(`(^|_)(${p})(_API)?_(KEY|TOKEN)$`), name]);
// Settings files for working on the project itself (or its examples and tests), not for using it.
const DEV_FILE = /(^|\/)(examples?|samples?|demos?|tests?|e2e|fixtures|playground)\/|\.(development|dev|test|ci|local)\b/i;

const named = (vars: EnvVar[], table: [RegExp, string][]) => [
  ...new Set(vars.flatMap((v) => table.find(([rx]) => rx.test(v.name.toUpperCase()))?.[1] ?? [])),
];
const or = (names: string[]) => (names.length < 3 ? names.join(" or ") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`);

function ago(iso: string): { days: number; text: string } {
  const days = Math.max(0, (Date.now() - Date.parse(iso)) / 864e5);
  const text =
    days < 1 ? "today" : days < 2 ? "yesterday" : days < 30 ? `${Math.round(days)} days ago` : days < 365 ? `${Math.round(days / 30)} months ago` : `${(days / 365).toFixed(1)} years ago`;
  return { days, text };
}

function license(id: string | null): { short: string; text: string; tone: Tone } {
  if (!id) return { short: "Unclear", text: "GitHub found no license file, so check the README before reusing the code", tone: "maybe" };
  if (OPEN.test(id)) return { short: "Yes", text: `Open source (${id})`, tone: "yes" };
  if (SOURCE_AVAILABLE[id]) return { short: "Free to use, with limits", text: `${SOURCE_AVAILABLE[id]}: free to use, with limits on some business uses`, tone: "maybe" };
  return { short: "Check its license", text: "It has its own license: read it before using it for work", tone: "maybe" };
}

type Input = {
  meta: Pick<RepoMeta, "license" | "pushedAt" | "archived" | "stars" | "createdAt" | "ownerType" | "private">;
  analysis: { envVars: EnvVar[] };
  install: Pick<InstallOptions, "release">;
};

export function beforeYouStart(d: Input): Fact[] {
  const { meta, analysis, install } = d;
  const lic = license(meta.license); // GitHub's "NOASSERTION" means a license it couldn't name
  const vars = analysis.envVars.filter((v) => !DEV_FILE.test(v.source));
  const ai = named(vars, AI);
  const facts: Fact[] = [{ id: "free", q: "Is it free?", a: lic.short, why: `${lic.text}.`, tone: lic.tone }];

  // Paid AI: a settings file lists every provider an app can talk to, not which one it needs, so this says what's
  // there and leaves "required?" to the README rather than guessing.
  if (ai.length)
    facts.push({
      id: "ai",
      q: "Paid AI services?",
      a: `Can use ${or(ai)}`,
      why: `Its settings have keys for ${ai.length === 1 ? "this paid API" : "these paid APIs"}. Its README says whether one is required.`,
      tone: "maybe",
    });

  // Is it still maintained? The later of the last push and the latest release.
  const release = install.release?.publishedAt;
  const last = ago(release && Date.parse(release) > Date.parse(meta.pushedAt) ? release : meta.pushedAt);
  const releaseText = install.release ? ` Latest release ${install.release.tag}, ${ago(install.release.publishedAt).text}.` : "";
  facts.push(
    meta.archived
      ? { id: "maintained", q: "Still maintained?", a: "No, archived", why: "The owners archived it: no more fixes or updates.", tone: "no" }
      : last.days < 90
        ? { id: "maintained", q: "Still maintained?", a: "Yes, active", why: `Last change ${last.text}.${releaseText}`, tone: "yes" }
        : last.days < 365
          ? { id: "maintained", q: "Still maintained?", a: "Slowing down", why: `Last change ${last.text}.${releaseText}`, tone: "maybe" }
          : { id: "maintained", q: "Still maintained?", a: "Looks inactive", why: `Last change ${last.text}. Fixes may not come.${releaseText}`, tone: "no" },
  );

  // Can I trust it? Track record only: no one can promise code is safe, so this never says "safe". A private repo is
  // the visitor's own (or their team's), and has no public track record to go on.
  if (meta.private) return facts;
  const age = meta.createdAt ? ago(meta.createdAt) : null;
  const by = meta.ownerType === "Organization" ? "an organization" : null;
  const record = [
    `${compactCount(meta.stars)} stars`,
    ...(age ? [`${age.days < 365 ? `${Math.max(1, Math.round(age.days / 30))} months` : `${Math.floor(age.days / 365)} years`} old`] : []),
    ...(by ? [`by ${by}`] : []),
  ].join(", ");
  const known = meta.stars >= 1000 && (!age || age.days >= 365);
  const fresh = meta.stars < 100 || (age !== null && age.days < 90);
  facts.push(
    known
      ? { id: "trust", q: "Can I trust it?", a: "Widely used", why: `${record}. As with any download, get it from the official repo.`, tone: "yes" }
      : fresh
        ? { id: "trust", q: "Can I trust it?", a: "New, little track record", why: `${record}. Look at the code and the owner before running it.`, tone: "maybe" }
        : { id: "trust", q: "Can I trust it?", a: "Some track record", why: `${record}. Get it from the official repo and read what it installs.`, tone: "yes" },
  );
  return facts;
}
