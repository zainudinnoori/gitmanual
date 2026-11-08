import { answered, asked, beforeYouStart } from "./facts";
import { fitCheck } from "./fit";
import { flowMermaid, flowWorthShowing, setupFlow } from "./flow";
import type { Arch } from "./install";
import { OS_LABEL, OS_LIST, type OS } from "./os";
import type { RepoData } from "./pipeline";
import type { Votes } from "./db";

// A manual's facts in a compact, machine-readable form: what the JSON API, the MCP server and llms.txt hand to
// AI agents and scripts. Same rules as the web page; nothing here is written by a model.

export type ManualFacts = {
  repo: string;
  description: string | null;
  stars: number;
  // Read with the caller's own GitHub token: built for that request only and never saved (lib/lookup.ts).
  private: boolean;
  manual: string;
  github: string;
  website: string | null;
  docs: string | null;
  maintainersGuide: string | null;
  difficulty: string;
  analyzedAt: string;
  // "Did you get it running?" answers from people who followed the manual, in all and per system.
  gotItRunning: { worked: number; stuck: number; bySystem: Partial<Record<OS, { worked: number; stuck: number }>> };
  // Is it free, does it use paid AI, is it maintained, can I trust it (lib/facts.ts)
  beforeYouStart: { question: string; answer: string; detail: string; tone: "yes" | "maybe" | "no" }[];
  systems: Partial<Record<OS, SystemFacts>>;
  parts: { runtimes: string[]; tools: string[]; packageManagers: string[]; services: string[]; envVars: { name: string; secret: boolean; optional: boolean }[] };
};

type SystemFacts = {
  verdict: "yes" | "maybe" | "no";
  headline: string;
  reasons: string[];
  downloads: { name: string; url: string; arch: string | null; recommended: boolean }[];
  downloadPage: string | null;
  installCommands: { method: string; command: string; kind: string }[];
  steps: { title: string; commands: string[]; note?: string }[];
  setupScript: string | null; // private repos have no saved copy to serve it from; get_setup_script returns it instead
  flowchart: string | null; // "How it fits together" as Mermaid (lib/flow.ts); null when there's only one way and nothing to it
};

export function manualFacts(d: RepoData, analyzedAt: number, site: string, only?: { os?: OS; arch?: Arch | null }, votes?: Votes): ManualFacts {
  const { meta, analysis: a, install, guides } = d;
  const base = site.replace(/\/$/, "");
  const manual = `${base}/${meta.fullName}`;
  const systems: ManualFacts["systems"] = {};
  for (const os of only?.os ? [only.os] : OS_LIST) {
    const fit = fitCheck(a, install, os, only?.arch ?? null, meta.archived);
    const flow = setupFlow(a, install, os);
    systems[os] = {
      verdict: fit.status,
      headline: fit.headline,
      reasons: fit.reasons,
      downloads: (install.release?.assets ?? [])
        .filter((x) => x.os === os)
        .map((x) => ({ name: x.name, url: x.url, arch: x.arch, recommended: x.recommended })),
      downloadPage: install.downloadPage?.urls[os] ?? null,
      installCommands: install.commands.filter((c) => c.os.includes(os)).map((c) => ({ method: c.method, command: c.command, kind: c.kind })),
      steps: a.steps[os].map((s) => ({ title: s.title, commands: s.commands, ...(s.note ? { note: s.note } : {}) })),
      setupScript: meta.private ? null : `${manual}/setup/${os === "windows" ? "windows.ps1" : `${os}.sh`}`,
      flowchart: flowWorthShowing(flow) ? flowMermaid(flow) : null,
    };
  }
  return {
    repo: meta.fullName,
    description: meta.description,
    stars: meta.stars,
    private: Boolean(meta.private),
    manual,
    github: meta.htmlUrl,
    website: guides.website,
    docs: guides.docs,
    maintainersGuide: guides.doc ? `${meta.htmlUrl}/blob/${meta.branch}/${guides.doc.path}` : null,
    difficulty: a.difficulty.label,
    analyzedAt: new Date(analyzedAt).toISOString(),
    gotItRunning: {
      worked: votes?.worked ?? 0,
      stuck: votes?.stuck ?? 0,
      bySystem: Object.fromEntries(OS_LIST.filter((os) => votes?.byOs[os]).map((os) => [os, votes!.byOs[os]])),
    },
    beforeYouStart: beforeYouStart(d).map((f) => ({ question: asked(f, meta.fullName), answer: f.a, detail: f.why, tone: f.tone })),
    systems,
    parts: {
      runtimes: a.runtimes.map((r) => (r.detail ? `${r.name} ${r.detail}` : r.name)),
      tools: a.tools,
      packageManagers: a.packageManagers.map((p) => p.name),
      services: a.services.map((s) => s.name),
      envVars: a.envVars.map((e) => ({ name: e.name, secret: e.secret, optional: Boolean(e.optional) })),
    },
  };
}

// The same facts as short Markdown for an agent to read or quote: the verdict first, then the easiest way in.
export function manualMarkdown(f: ManualFacts): string {
  const out: string[] = [
    `# ${f.repo}`,
    f.description ?? "",
    f.private ? `Private repo, read with your GitHub token and not saved. GitHub: ${f.github}` : `Manual: ${f.manual} · GitHub: ${f.github}`,
  ];
  if (f.website) out.push(`Website: ${f.website}`);
  if (f.docs) out.push(`Docs: ${f.docs}`);
  if (f.maintainersGuide) out.push(`Maintainers' setup guide: ${f.maintainersGuide}`);
  if (f.gotItRunning.worked + f.gotItRunning.stuck)
    out.push(`Got it running: ${f.gotItRunning.worked} people said yes, ${f.gotItRunning.stuck} got stuck.`);
  const parts = [...f.parts.runtimes, ...f.parts.tools, ...f.parts.services];
  if (parts.length) out.push(`Needs: ${parts.join(", ")}`);
  if (f.beforeYouStart.length) out.push("", "## Before you start", ...f.beforeYouStart.map((b) => `- ${b.question} ${b.answer}. ${b.detail}`));
  for (const [os, s] of Object.entries(f.systems) as [OS, SystemFacts][]) {
    out.push("", `## ${OS_LABEL[os]}: ${s.headline} (${s.verdict})`, ...s.reasons.map((r) => `- ${r}`));
    const best = s.downloads.find((x) => x.recommended) ?? s.downloads[0];
    if (best) out.push(`Download: ${best.name} ${best.url}`);
    else if (s.downloadPage) out.push(`Download page: ${s.downloadPage}`);
    for (const c of s.installCommands.slice(0, 3)) out.push(`Install (${c.method}): \`${c.command.split("\n")[0]}\``);
    if (s.steps.length) {
      out.push("Steps from source:");
      s.steps.forEach((st, i) => {
        out.push(`${i + 1}. ${st.title}${st.note ? ` (${st.note})` : ""}`);
        if (st.commands.length) out.push("```", ...st.commands, "```");
      });
      if (s.setupScript) out.push(`Setup script: ${s.setupScript}`);
    }
    if (s.flowchart) out.push("How it fits together:", "```mermaid", s.flowchart, "```");
  }
  out.push("", `Analyzed ${f.analyzedAt} by gitmanual from the repo's own files. Read commands before running them.`);
  return out.filter((l, i) => l !== "" || out[i - 1] !== "").join("\n");
}
