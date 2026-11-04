import type { Analysis } from "./detect";
import type { Arch, InstallOptions } from "./install";
import { OS_LABEL, type OS } from "./os";

export type Fit = {
  status: "yes" | "maybe" | "no";
  headline: string;
  reasons: string[];
};

// Answers "will this work on my machine?" from what the analysis already found.
export function fitCheck(a: Analysis, install: InstallOptions, os: OS, arch: Arch | null, archived: boolean): Fit {
  const name = OS_LABEL[os];
  const reasons: string[] = [];
  const assets = install.release?.assets.filter((x) => x.os === os) ?? [];
  // 32-bit Windows builds run on 64-bit Windows; Intel Mac builds run on Apple Silicon through Rosetta 2.
  const runsOn = (x: Arch | null) =>
    !arch || x === arch || x === "universal" || x === null || (os === "windows" && arch === "x64" && x === "x86") || (os === "mac" && arch === "arm64" && x === "x64");
  const forArch = assets.filter((x) => runsOn(x.arch));
  const native = forArch.some((x) => !arch || x.arch === arch || x.arch === "universal" || x.arch === null);
  const hasSource = a.steps[os].some((s) => /install dependencies|^run\b|start/i.test(s.title));

  if (install.declared?.unsupported.includes(os)) {
    reasons.push(`The project says: “${install.declared.quote}”`);
    if (os !== "linux") reasons.push(`It may run inside a Linux virtual machine${os === "windows" ? " or WSL2" : ""}, but that's not a supported setup.`);
    return { status: "no", headline: `Not supported on ${name}`, reasons };
  }

  if (os !== "mac" && a.hints.some((h) => h.startsWith("Built on Apple's MLX"))) {
    reasons.push("It's built on Apple's MLX, which is made for Apple Silicon Macs. Check the README for Windows or Linux support before installing.");
    return { status: "maybe", headline: `Made for Apple Silicon Macs`, reasons };
  }

  if (archived) reasons.push("The repo is archived: it still works as-is, but nobody is fixing bugs anymore.");

  if (a.needsDevice) {
    reasons.push("The app runs on a separate device (phone, tablet or TV). Your computer only installs it.");
    if (a.compatibility) reasons.push(`The README lists supported devices under “${a.compatibility.heading}”. Find yours there first.`);
    else reasons.push("The README has no device list, so check that your device supports ADB debugging.");
    return { status: "maybe", headline: "Depends on your device", reasons };
  }

  const cmds = install.commands.filter((c) => c.os.includes(os));
  const app = cmds.find((c) => c.kind === "app");
  if (forArch.length || app) {
    reasons.push(forArch.length ? `A ready-made ${name} download is in the latest release.` : `The README gives a ${app!.method} install for ${name}.`);
    if (forArch.length && !native && !app) {
      reasons.push(os === "mac" ? "The download is built for Intel Macs; it runs on Apple Silicon through Rosetta 2." : "The download is the 32-bit build; it runs fine on 64-bit Windows.");
    }
    return { status: "yes", headline: `Yes, it installs on your ${name}`, reasons };
  }

  if (assets.length && arch) {
    reasons.push(`There are ${name} downloads, but none built for your chip. Building from source usually still works.`);
    return { status: "maybe", headline: "Probably, from source", reasons };
  }

  if (install.platforms.length && !install.platforms.includes(os)) {
    reasons.push(`Apps are only published for ${install.platforms.map((p) => OS_LABEL[p]).join(" and ")}.`);
    if (!hasSource) return { status: "no", headline: `No ${name} version`, reasons };
  }

  if (cmds.some((c) => c.kind === "docker")) {
    reasons.push("It's a self-hosted app: the README runs it with Docker, and you open it in your browser.");
    if (os !== "linux") reasons.push(`On ${name} that means installing Docker Desktop first.`);
    return { status: "yes", headline: `Yes, with Docker on ${name}`, reasons };
  }

  const scaffold = cmds.find((c) => c.kind === "scaffold");
  if (scaffold) {
    reasons.push(`It's a framework: you start a new project with it (\`${scaffold.command}\`) instead of installing an app.`);
    return { status: "yes", headline: `Yes, start a project on ${name}`, reasons };
  }

  const lib = cmds.find((c) => c.kind === "library");
  if (lib) {
    reasons.push(`It's a library: you add it to your own project (\`${lib.command}\`), there's no app to open.`);
    return { status: "yes", headline: `Yes, as a library on ${name}`, reasons };
  }

  if (a.osNotes[os].length) {
    reasons.push(...a.osNotes[os]);
    return { status: "maybe", headline: `Yes, with extra tools on ${name}`, reasons };
  }

  if (hasSource || a.runtimes.length) {
    const parts = [...a.runtimes.map((r) => r.name), ...a.tools];
    reasons.push(parts.length ? `You'll build it yourself with ${parts.slice(0, 4).join(", ")}.` : "You'll build it yourself from the source code.");
    if (a.services.length) reasons.push(`It also needs ${a.services.map((s) => s.name).join(", ")} running (Docker handles this).`);
    return { status: "yes", headline: `Yes, it runs on ${name}`, reasons };
  }

  reasons.push("We couldn't spot a known setup. The README below is your best guide.");
  return { status: "maybe", headline: "Not sure yet", reasons };
}

export function setupTime(score: number): string {
  if (score <= 2) return "about 5 min";
  if (score <= 5) return "about 15 min";
  return "30 min or more";
}

// How recently someone touched the code: a quick health signal.
export function freshness(pushedAt: string): { label: string; tone: "yes" | "maybe" | "no" } {
  const days = (Date.now() - new Date(pushedAt).getTime()) / 864e5;
  if (days < 30) return { label: "Updated this month", tone: "yes" };
  if (days < 365) return { label: `Updated ${Math.round(days / 30)} months ago`, tone: "yes" };
  return { label: `Quiet for ${(days / 365).toFixed(1)} years`, tone: "maybe" };
}
