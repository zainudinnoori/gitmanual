import { commandRisks } from "./checks";
import { asked, beforeYouStart } from "./facts";
import { fitCheck, freshness, setupTime } from "./fit";
import { addonLinks, installChoices, maintainCommands, pythonRange, venvAgain, venvFolder, withVenv, type InstallRole } from "./install";
import { manualFacts } from "./manual";
import { OS_LABEL, OS_LIST, OS_SLUG, type OS } from "./os";
import type { RepoData } from "./pipeline";

// A repo's manual for one system as a document to keep: what the Markdown download (free) and the PDF (Pro,
// lib/pdf.tsx) are both made from. Built from the same facts as the web page; nothing here is written by a model.

export type Tone = "yes" | "maybe" | "no";
export type Command = { text: string; risks: string[] };

export type ManualDoc = {
  repo: string;
  owner: string;
  name: string;
  description: string | null;
  os: OS;
  system: string; // "macOS"
  manualUrl: string; // the live manual for this system
  github: string;
  website: string | null;
  docs: string | null;
  maintainersGuide: string | null;
  license: string | null;
  language: string | null;
  topics: string[];
  maintainedBy: "organization" | "person" | null;
  release: { tag: string; date: string } | null; // the latest release, if the project makes them
  systems: { os: OS; system: string; tone: Tone; headline: string }[]; // will it work, on all three
  facts: { difficulty: string; time: string; stars: number; activity: string; lastChange: string; gotItRunning: number };
  readAt: string; // ISO time the repo was read
  branch: string;
  commit: string | null; // the branch's commit when the file was made, so the copy can be traced back
  verdict: { tone: Tone; headline: string; reasons: string[] };
  beforeYouStart: { question: string; answer: string; detail: string; tone: Tone }[];
  parts: { name: string; kind: string }[];
  download: { name: string; url: string } | null;
  downloadPage: string | null;
  // The ways to install it, sorted: the recommended one first, then alternatives, optional add-ons, and installs
  // into your own code. Each says what it needs; pip ones come with a virtual environment.
  installCommands: InstallItem[];
  // The recommended way from start to finish, given most of page 2: install it, check it works, and how to get back
  // to it next time. Null when the only way is building from source.
  start: {
    download: { name: string; url: string } | null;
    downloadPage: string | null; // the project's own download page, when its releases have no files for this system
    install: InstallItem | null;
    check: { command: Command; expect: string } | null;
    nextTime: Command | null;
    // What the repo doesn't say for this way, so the manual says so rather than guessing: "check" (how to check it
    // works), "upkeep" (how to update or remove it).
    undocumented: ("check" | "upkeep")[];
  } | null;
  // Keeping the recommended install up to date and removing it.
  maintain: { update: Command; uninstall: Command; note?: string } | null;
  // What each way needs, for page 1: the recommended install, and building from source.
  routes: { label: string; needs: string[] }[];
  steps: { title: string; note?: string; commands: Command[] }[];
  setupScript: string | null;
  // Building from source stops before running it and the repo's files don't say how: say so, and point to its docs.
  runUndocumented: { docs: string | null } | null;
  envVars: { name: string; secret: boolean; optional: boolean }[];
};

export type InstallItem = { method: string; role: InstallRole; label: string; note?: string; link?: string; needs: string[]; command: Command };

const command = (text: string): Command => ({ text, risks: commandRisks(text).map((r) => r.label) });

// "Python >=3.11" → "Python 3.11 or newer", wherever a version range is shown to people.
const readable = (text: string) => text.replace(/\bPython ([<>=~!][^,·;]*?)(?=\s*(?:[,·;]|$))/g, (_, spec: string) => `Python ${pythonRange(spec.trim()) ?? spec}`);

// PowerShell refuses to run the activation script on a fresh Windows; this is the usual fix, for the person's own account.
const WINDOWS_SCRIPTS = "If PowerShell says running scripts is disabled, allow it for your account with: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned";

// Page 1 has the stars and dates in its facts grid; the "before you start" answers don't repeat them.
function withoutRepeats(id: string, why: string): string {
  if (id === "maintained") return why.replace(/Last change on [^.]+\.\s*/, "").replace(/\s*Latest release [^,]+, on [^.]+\./, "").trim();
  if (id === "trust") return why.replace(/^[\d.,]+k? stars,?\s*/i, "").replace(/^./, (c) => c.toUpperCase());
  return why;
}

export function manualDoc(d: RepoData, analyzedAt: number, site: string, os: OS, votes?: { worked: number }, commit?: string | null): ManualDoc {
  const f = manualFacts(d, analyzedAt, site, { os });
  const s = f.systems[os]!;
  const [owner, name] = f.repo.split("/");
  const best = s.downloads.find((x) => x.recommended) ?? s.downloads[0] ?? null;
  const choices = installChoices(
    d.install.commands.filter((c) => c.os.includes(os)),
    { name: d.meta.fullName.split("/")[1] },
    d.analysis.pythonPackage,
    { download: Boolean(best), addons: addonLinks(d.analysis.otherManifests ?? [], d.meta.htmlUrl, d.meta.branch) },
  );
  const folder = venvFolder(name);
  const items: InstallItem[] = choices.map((c) => ({
    method: c.method,
    role: c.role,
    label: c.label,
    ...(c.note || (c.venv && os === "windows") ? { note: [c.note, c.venv && os === "windows" ? `${WINDOWS_SCRIPTS}.` : ""].filter(Boolean).join(" ") } : {}),
    ...(c.link ? { link: c.link } : {}),
    needs: c.needs,
    command: command(c.venv ? withVenv(c.command, os, folder) : c.command),
  }));
  const main = choices.find((c) => c.role === "recommended") ?? null;
  const mainItem = main ? items[choices.indexOf(main)] : null;
  // Checking it worked: the command the package installs, asking for its help.
  const script = main?.venv ? d.analysis.pythonPackage?.scripts?.[0] : undefined;
  const upkeep = main ? maintainCommands(main, os, main.venv ? folder : undefined) : null;
  return {
    repo: f.repo,
    owner,
    name,
    description: f.description?.replace(/:[a-z0-9_+-]+:\s*/g, "").trim() || null,
    os,
    system: OS_LABEL[os],
    manualUrl: `${f.manual}/${OS_SLUG[os]}`,
    github: f.github,
    website: f.website,
    docs: f.docs,
    maintainersGuide: f.maintainersGuide,
    license: d.meta.license,
    language: d.meta.language,
    topics: d.meta.topics.slice(0, 6),
    maintainedBy: d.meta.ownerType === "Organization" ? "organization" : d.meta.ownerType === "User" ? "person" : null,
    release: d.install.release ? { tag: d.install.release.tag, date: d.install.release.publishedAt } : null,
    systems: OS_LIST.map((o) => {
      const fit = fitCheck(d.analysis, d.install, o, null, d.meta.archived);
      return { os: o, system: OS_LABEL[o], tone: fit.status, headline: fit.headline };
    }),
    facts: {
      difficulty: f.difficulty,
      time: setupTime(d.analysis.difficulty.score),
      stars: f.stars,
      activity: freshness(d.meta.pushedAt).label,
      lastChange: d.meta.pushedAt,
      gotItRunning: votes?.worked ?? 0,
    },
    readAt: f.analyzedAt,
    branch: d.meta.branch,
    commit: commit ?? null,
    verdict: { tone: s.verdict, headline: s.headline, reasons: s.reasons },
    // Real dates rather than "3 days ago": a downloaded copy is read long after it was made.
    beforeYouStart: beforeYouStart(d, { dated: true }).map((b) => ({ question: asked(b, f.repo), answer: b.a, detail: withoutRepeats(b.id, b.why), tone: b.tone })),
    parts: [
      ...f.parts.runtimes.map((n) => ({ name: readable(n), kind: "runtime" })),
      ...f.parts.packageManagers.map((n) => ({ name: n, kind: "package manager" })),
      ...f.parts.tools.map((n) => ({ name: n, kind: "tool" })),
      ...f.parts.services.map((n) => ({ name: n, kind: "service" })),
    ],
    download: best && { name: best.name, url: best.url },
    downloadPage: best ? null : s.downloadPage,
    installCommands: items,
    start:
      best || mainItem || s.downloadPage
        ? {
            download: best && { name: best.name, url: best.url },
            downloadPage: best || mainItem ? null : s.downloadPage,
            install: best ? null : mainItem,
            check:
              !best && script
                ? {
                    command: command(`${script} --help`),
                    // Proves it's installed and starts; using it for real is up to the project's own docs.
                    expect: `If it prints ${script}'s help (the options it takes), it's installed and starts. It hasn't done any work yet: the project's README shows how to use it.`,
                  }
                : null,
            nextTime: !best && main?.venv ? command(venvAgain(os, folder)) : null,
            undocumented: best || !mainItem ? [] : [...(script ? [] : ["check" as const]), ...(upkeep ? [] : ["upkeep" as const])],
          }
        : null,
    maintain: !best && upkeep ? { update: command(upkeep.update), uninstall: command(upkeep.uninstall), ...(upkeep.note ? { note: upkeep.note } : {}) } : null,
    routes: [
      ...(best
        ? [{ label: "Recommended: download the app", needs: [] }]
        : choices[0]?.role === "recommended"
          ? [{ label: choices[0].label.replace(/^Recommended: /, "Recommended: install with "), needs: choices[0].needs }]
          : []),
      ...(s.steps.length ? [{ label: "Build from source", needs: [...f.parts.runtimes.map(readable), ...f.parts.tools, ...f.parts.services] }] : []),
    ],
    steps: s.steps.map((st) => {
      // macOS steps that use Homebrew: say where to get it, since not everyone has it.
      const brew = os === "mac" && st.commands.some((c) => /^brew\b/m.test(c)) ? "Needs Homebrew (brew.sh)." : "";
      const note = [st.note && readable(st.note), brew].filter(Boolean).join(" · ");
      return { title: st.title, ...(note ? { note } : {}), commands: st.commands.map(command) };
    }),
    setupScript: s.steps.length > 1 ? s.setupScript : null,
    runUndocumented:
      !(best || mainItem || s.downloadPage) && s.steps.length && !s.steps.some((st) => /^(Run it|Build and run|Follow the README|Start )/i.test(st.title))
        ? { docs: f.docs ?? f.website ?? f.maintainersGuide }
        : null,
    envVars: f.parts.envVars,
  };
}

export const docFilename = (doc: ManualDoc, ext: "pdf" | "md") => `${doc.name}-${OS_SLUG[doc.os]}-setup-manual.${ext}`;

export const readDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// How a copy names its source: "main @ 3f2a9c1".
export const source = (doc: ManualDoc) => (doc.commit ? `${doc.branch} @ ${doc.commit.slice(0, 7)}` : doc.branch);

// A step's commands run one after another in the same terminal, so they're shown as one block, with every warning.
export const joined = (commands: Command[]): Command | null =>
  commands.length ? { text: commands.map((c) => c.text).join("\n"), risks: [...new Set(commands.flatMap((c) => c.risks))] } : null;

// Headlines are written for the page that knows your system ("installs on your macOS"); a file says it plainly.
export const plainHeadline = (h: string) => h.replace(/\byour\s+/gi, "");

const TONE_MARK: Record<Tone, string> = { yes: "Yes", maybe: "Maybe", no: "No" };

// Plain Markdown that reads well in any editor, on GitHub or printed: checklists to tick, commands in code blocks.
export function manualDocMarkdown(doc: ManualDoc): string {
  const fence = (c: Command) => {
    const lines = ["```" + (doc.os === "windows" ? "powershell" : "bash"), c.text, "```"];
    if (c.risks.length) lines.push(`> **Careful:** ${c.risks.join("; ")}.`);
    return lines.join("\n");
  };
  const out: string[] = [
    `# ${doc.repo}: setup manual for ${doc.system}`,
    "",
    doc.description ? `${doc.description}\n` : "",
    `| Difficulty | Estimated time | Stars | Last change |`,
    `| --- | --- | --- | --- |`,
    `| ${doc.facts.difficulty} | ${doc.facts.time} | ${doc.facts.stars.toLocaleString("en-US")} | ${shortDate(doc.facts.lastChange)} |`,
    "",
    `Live manual: ${doc.manualUrl}  `,
    `Read from ${doc.github} (${source(doc)}) on ${readDate(doc.readAt)}. Made from the repo's own files; gitmanual hasn't run these steps.`,
    "",
    `## Will it work on ${doc.system}?`,
    "",
    `**${TONE_MARK[doc.verdict.tone]}: ${plainHeadline(doc.verdict.headline)}**`,
    "",
    ...doc.verdict.reasons.map((r) => `- ${r}`),
  ];
  if (doc.beforeYouStart.length)
    out.push("", "## Before you start", "", ...doc.beforeYouStart.map((b) => `- **${b.question}** ${b.answer}. ${b.detail}`));
  if (doc.routes.length)
    out.push("", "## What you need", "", ...doc.routes.map((r) => `- **${r.label}:** ${r.needs.length ? r.needs.join(", ") : "nothing else"}`));
  const option = (c: InstallItem) => {
    out.push("", `**${c.label}**${c.needs.length ? ` (needs ${c.needs.join(", ")})` : ""}`);
    if (c.note) out.push("", c.link ? `${c.note} Its setup: ${c.link}` : c.note);
    out.push("", fence(c.command));
  };
  const others = doc.installCommands.filter((c) => c.role !== "recommended");
  if (doc.start) {
    out.push("", "## Install it", "", `The recommended way${others.length || doc.steps.length ? ": most people should use this one. Other ways come later." : "."}`);
    if (doc.start.download) out.push("", `Download **${doc.start.download.name}**: ${doc.start.download.url}`);
    if (doc.start.downloadPage) out.push("", `Download page: ${doc.start.downloadPage}`);
    if (doc.start.install) option(doc.start.install);
    const undocumented = "Not documented in the repository. Check its README.";
    if (doc.start.check) out.push("", "### Check it works", "", fence(doc.start.check.command), "", doc.start.check.expect);
    else if (doc.start.undocumented.includes("check")) out.push("", "### Check it works", "", undocumented);
    if (doc.start.nextTime)
      out.push("", "### Next time", "", "A new terminal starts outside the environment. Go to its folder and switch it back on:", "", fence(doc.start.nextTime));
    if (doc.start.nextTime && doc.os === "windows") out.push("", `${WINDOWS_SCRIPTS}.`);
    if (doc.start.undocumented.includes("upkeep")) out.push("", "### Update or remove it", "", undocumented);
    if (doc.maintain) {
      out.push("", "### Update or remove it", "", "To update to the latest version:", "", fence(doc.maintain.update), "", "To remove it:", "", fence(doc.maintain.uninstall));
      if (doc.maintain.note) out.push("", doc.maintain.note);
    }
  }
  if (others.length) {
    out.push(
      "",
      "## Other ways to install",
      "",
      `${doc.start ? "Choose one way. You don't need these if the recommended way worked" : "Choose one way"}${others.some((c) => c.role === "optional") ? "; optional add-ons go on top of it." : "."}`,
    );
    others.forEach(option);
  }
  if (doc.steps.length) {
    out.push("", `## Build from source: ${doc.steps.length} ${doc.steps.length === 1 ? "step" : "steps"}`);
    doc.steps.forEach((st, i) => {
      out.push("", `### ${i + 1}. ${st.title}`);
      if (st.note) out.push("", st.note);
      const block = joined(st.commands);
      if (block) out.push("", fence(block));
    });
    if (doc.runUndocumented)
      out.push("", `**Running it:** not documented in the repository's files.${doc.runUndocumented.docs ? ` The project's docs: ${doc.runUndocumented.docs}` : " Check its README."}`);
    if (doc.setupScript) out.push("", `All the steps as one script: ${doc.setupScript}`);
  }
  if (doc.envVars.length)
    out.push(
      "",
      "## Settings",
      "",
      "| Variable | |",
      "| --- | --- |",
      ...doc.envVars.map((e) => `| \`${e.name}\` | ${[e.secret && "secret: keep it private", e.optional && "optional"].filter(Boolean).join(", ") || "needed"} |`),
    );
  const links = [
    ["GitHub", doc.github],
    ["Website", doc.website],
    ["Docs", doc.docs],
    ["Maintainers' setup guide", doc.maintainersGuide],
  ].filter((l): l is [string, string] => Boolean(l[1]));
  out.push("", "## Links", "", ...links.map(([k, v]) => `- ${k}: ${v}`));
  out.push(
    "",
    "---",
    "",
    `${doc.repo} belongs to its authors${doc.license ? ` (${doc.license} license)` : ""}. This manual was made by gitmanual from the repo's own files and can be out of date or wrong for your machine. **Read every command before you run it.**`,
    "",
  );
  return out.filter((l, i) => !(l === "" && out[i - 1] === "")).join("\n");
}
