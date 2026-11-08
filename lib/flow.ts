import type { Analysis } from "./detect";
import type { InstallOptions } from "./install";
import { OS_LABEL, type OS } from "./os";

// "How it fits together": a repo's setup route on one system as a small graph, built only from what the manual
// already found (no model, so private repos are safe). The manual page draws it as cards; the Markdown, the API
// and the MCP server get the same graph as Mermaid, which GitHub renders in READMEs and agents read well.
//   Get it → Run it → It uses

export type FlowNode = {
  id: string;
  label: string;
  detail?: string;
  code?: boolean; // the label is a command
  best?: boolean; // the fastest way in
  secret?: boolean;
  jump?: { mode?: "install" | "source"; to: string }; // where on the manual page it's explained (the parts list is on every tab)
};
export type FlowGroup = { id: "get" | "run" | "uses"; title: string; nodes: FlowNode[]; more: number };
export type Flow = { os: OS; groups: FlowGroup[]; edges: [from: string, to: string][] };

const MAX = 5; // nodes shown per group; the rest are counted in "more"
const INSTALL = { mode: "install", to: "main-tabs" } as const;
const SOURCE = { mode: "source", to: "our-steps" } as const;
const PARTS = { to: "parts" } as const;

export function setupFlow(a: Analysis, install: InstallOptions, os: OS): Flow {
  const label = OS_LABEL[os];
  const cmds = install.commands.filter((c) => c.os.includes(os));
  const get: FlowNode[] = [];
  const assets = install.release?.assets.filter((x) => x.os === os) ?? [];
  if (assets.length) {
    const best = assets.find((x) => x.recommended) ?? assets[0];
    get.push({ id: "download", label: "Download the app", detail: best.name, jump: INSTALL });
  } else if (install.downloadPage?.platforms.includes(os)) {
    get.push({ id: "download", label: "Download the app", detail: `From ${install.downloadPage.host}`, jump: INSTALL });
  }
  const app = cmds.find((c) => c.kind === "app");
  if (app) {
    const how = /script/i.test(app.method) ? "Run the install script" : `Install with ${app.method}`;
    get.push({ id: "command", label: how, detail: `One command on ${label}`, jump: INSTALL });
  }
  if (install.release?.deviceAssets.length) get.push({ id: "device", label: "Install on your device", detail: "Android / TV app (.apk)", jump: INSTALL });
  const docker = cmds.find((c) => c.kind === "docker");
  if (docker) get.push({ id: "docker", label: "Run it with Docker", detail: "Self-hosted, opens in your browser", jump: INSTALL });
  const scaffold = cmds.find((c) => c.kind === "scaffold");
  if (scaffold) get.push({ id: "scaffold", label: "Start a project with it", detail: "Makes a new project folder", jump: INSTALL });
  const lib = cmds.find((c) => c.kind === "library");
  if (lib) get.push({ id: "library", label: "Add it to your project", detail: `With ${lib.method}, in your own code`, jump: INSTALL });
  // What building needs rides on the source card; the full list is the Parts list beside the steps.
  const steps = a.steps[os];
  const needs = [...a.runtimes.map((r) => r.name), ...a.tools, ...a.packageManagers.map((p) => p.name)].filter((n, i, all) => all.indexOf(n) === i);
  const needsText = needs.length ? ` · needs ${needs.slice(0, 3).join(", ")}${needs.length > 3 ? ` + ${needs.length - 3} more` : ""}` : "";
  get.push({ id: "source", label: "Build from source", detail: `${steps.length} ${steps.length === 1 ? "step" : "steps"}${needsText}`, jump: SOURCE });
  get[0].best = true;

  // What running it looks like after each way in. Only the source route has a command of ours to show.
  const run: FlowNode[] = [];
  const edges: Flow["edges"] = [];
  const start = steps.find((s) => s.title === "Run it");
  if (start?.commands.length) {
    run.push({
      id: "start",
      label: start.commands[0],
      code: true,
      detail: start.commands.length > 1 ? `and ${start.commands.length - 1} more, each in its own terminal` : "from the repo folder",
      jump: SOURCE,
    });
    edges.push(["source", "start"]);
  }
  // An install command can end in an app, a server or a command-line tool, so only a download is sure to be "open it".
  if (get.some((n) => n.id === "download")) {
    run.push({ id: "open", label: "Open the app", detail: `Like any other ${label} app` });
    edges.push(["download", "open"]);
  }
  if (docker) {
    run.push({ id: "browser", label: "Open it in your browser", detail: "Docker keeps it running" });
    edges.push(["docker", "browser"]);
  }

  // Backing services and .env settings belong to running it yourself.
  const uses: FlowNode[] = a.services.map((s, i) => ({ id: `service${i}`, label: s.name, detail: "service", jump: PARTS }));
  if (a.envVars.length) {
    const secrets = a.envVars.filter((e) => e.secret && !e.optional).map((e) => e.name);
    uses.push({
      id: "env",
      label: `${a.envVars.length} ${a.envVars.length === 1 ? "setting" : "settings"} in .env`,
      detail: secrets.length ? `Secrets: ${secrets.slice(0, 3).join(", ")}${secrets.length > 3 ? "…" : ""}` : "None are secret",
      secret: secrets.length > 0,
      jump: PARTS,
    });
  }
  const user = run.find((n) => n.id === "start") ?? run.find((n) => n.id === "browser");

  const groups: FlowGroup[] = [];
  const add = (id: FlowGroup["id"], title: string, nodes: FlowNode[], max = MAX) => {
    if (nodes.length) groups.push({ id, title, nodes: nodes.slice(0, max), more: Math.max(0, nodes.length - max) });
  };
  add("get", "Get it", get, get.length); // every way in, so "Build from source" is never cut
  add("run", "Run it", run);
  if (user) add("uses", "It uses", uses);

  const shown = new Set(groups.flatMap((g) => g.nodes.map((n) => n.id)));
  if (user) for (const n of uses) if (shown.has(n.id)) edges.push([user.id, n.id]);
  return { os, groups, edges: edges.filter(([f, t]) => shown.has(f) && shown.has(t)) };
}

// Worth drawing once there's more than one way in, or the route has parts to it.
export const flowWorthShowing = (f: Flow) => f.groups.length >= 2;

// The same graph as Mermaid. Labels are quoted with entity codes for the characters Mermaid would misread.
export function flowMermaid(f: Flow): string {
  const esc = (s: string) => s.replace(/&/g, "#amp;").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/[\r\n]+/g, " ");
  const out = ["flowchart LR"];
  for (const g of f.groups) {
    out.push(`  subgraph ${g.id}["${esc(g.title)}"]`);
    for (const n of g.nodes) {
      // The <br/> is ours; only the repo's own text is escaped.
      out.push(`    ${n.id}["${esc(n.label)}${n.detail ? `<br/>${esc(n.detail)}` : ""}"]`);
    }
    if (g.more) out.push(`    ${g.id}_more["and ${g.more} more"]`);
    out.push("  end");
  }
  for (const [from, to] of f.edges) out.push(`  ${from} --> ${to}`);
  const best = f.groups.flatMap((g) => g.nodes).filter((n) => n.best);
  if (best.length) out.push("  classDef best fill:#ff6b2c,stroke:#15161a,color:#15161a", `  class ${best.map((n) => n.id).join(",")} best`);
  return out.join("\n");
}
