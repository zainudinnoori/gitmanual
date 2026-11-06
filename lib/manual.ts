import { fitCheck } from "./fit";
import type { Arch } from "./install";
import { OS_LABEL, OS_LIST, type OS } from "./os";
import type { RepoData } from "./pipeline";

// A manual's facts in a compact, machine-readable form: what the JSON API, the MCP server and llms.txt hand to
// AI agents and scripts. Same rules as the web page; nothing here is written by a model.

export type ManualFacts = {
  repo: string;
  description: string | null;
  stars: number;
  manual: string;
  github: string;
  website: string | null;
  docs: string | null;
  maintainersGuide: string | null;
  difficulty: string;
  analyzedAt: string;
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
  setupScript: string;
};

export function manualFacts(d: RepoData, analyzedAt: number, site: string, only?: { os?: OS; arch?: Arch | null }): ManualFacts {
  const { meta, analysis: a, install, guides } = d;
  const base = site.replace(/\/$/, "");
  const manual = `${base}/${meta.fullName}`;
  const systems: ManualFacts["systems"] = {};
  for (const os of only?.os ? [only.os] : OS_LIST) {
    const fit = fitCheck(a, install, os, only?.arch ?? null, meta.archived);
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
      setupScript: `${manual}/setup/${os === "windows" ? "windows.ps1" : `${os}.sh`}`,
    };
  }
  return {
    repo: meta.fullName,
    description: meta.description,
    stars: meta.stars,
    manual,
    github: meta.htmlUrl,
    website: guides.website,
    docs: guides.docs,
    maintainersGuide: guides.doc ? `${meta.htmlUrl}/blob/${meta.branch}/${guides.doc.path}` : null,
    difficulty: a.difficulty.label,
    analyzedAt: new Date(analyzedAt).toISOString(),
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
  const out: string[] = [`# ${f.repo}`, f.description ?? "", `Manual: ${f.manual} · GitHub: ${f.github}`];
  if (f.website) out.push(`Website: ${f.website}`);
  if (f.docs) out.push(`Docs: ${f.docs}`);
  if (f.maintainersGuide) out.push(`Maintainers' setup guide: ${f.maintainersGuide}`);
  const parts = [...f.parts.runtimes, ...f.parts.tools, ...f.parts.services];
  if (parts.length) out.push(`Needs: ${parts.join(", ")}`);
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
      out.push(`Setup script: ${s.setupScript}`);
    }
  }
  out.push("", `Analyzed ${f.analyzedAt} by gitmanual from the repo's own files. Read commands before running them.`);
  return out.filter((l, i) => l !== "" || out[i - 1] !== "").join("\n");
}
