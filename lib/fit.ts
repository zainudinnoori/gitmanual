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
  const forArch = arch ? assets.filter((x) => x.arch === arch || x.arch === "universal" || x.arch === null) : assets;
  const hasSource = a.steps[os].some((s) => /install dependencies|^run\b|start/i.test(s.title));

  if (archived) reasons.push("The repo is archived: it still works as-is, but nobody is fixing bugs anymore.");

  if (a.needsDevice) {
    reasons.push("The app runs on a separate device (phone, tablet or TV). Your computer only installs it.");
    if (a.compatibility) reasons.push(`The README lists supported devices under “${a.compatibility.heading}”. Find yours there first.`);
    else reasons.push("The README has no device list, so check that your device supports ADB debugging.");
    return { status: "maybe", headline: "Depends on your device", reasons };
  }

  if (forArch.length || install.commands.some((c) => c.os.includes(os))) {
    reasons.push(forArch.length ? `A ready-made ${name} download is in the latest release.` : `It installs with a package manager on ${name}.`);
    for (const n of a.osNotes[os]) reasons.push(n);
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
