import type { Analysis } from "./detect";
import { fitCheck } from "./fit";
import type { InstallOptions } from "./install";
import { OS_LIST, type OS } from "./os";

// A repo's searchable facts as one space-separated string, stored next to it so lists and suggestions are a
// LIKE query instead of parsing every manual. " os:windows " = it runs on Windows (verdict yes),
// " dl:windows " = it has a ready-made Windows download, " t:self-hosted " = a GitHub topic.
// Bump FACETS_VERSION when the format changes; older rows are rebuilt from their stored manual.
export const FACETS_VERSION = "f2";

// A real app or binary for the system: a release file or the project's own download page.
// (install.platforms also counts package-manager installs like pip, which aren't a download.)
export const hasDownload = (install: InstallOptions, os: OS) =>
  Boolean(install.release?.assets.some((a) => a.os === os) || install.downloadPage?.platforms.includes(os));

type Data = { meta: { topics?: string[]; archived: boolean }; analysis: Analysis; install: InstallOptions };

export function facetsOf(d: Data): string {
  const tokens = [FACETS_VERSION];
  for (const os of OS_LIST) {
    if (fitCheck(d.analysis, d.install, os, null, d.meta.archived).status === "yes") tokens.push(`os:${os}`);
    if (hasDownload(d.install, os)) tokens.push(`dl:${os}`);
  }
  for (const t of d.meta.topics ?? []) if (/^[a-z0-9-]+$/i.test(t)) tokens.push(`t:${t.toLowerCase()}`);
  // Padded with spaces so every token can be matched as "% token %".
  return ` ${tokens.join(" ")} `;
}

// Topics too broad to say two repos do the same job: events, labels, languages and the systems themselves.
const BROAD = new Set(
  "hacktoberfest open-source opensource oss foss free awesome github cross-platform docker linux macos windows python javascript typescript go golang rust ruby php java kotlin swift c cpp csharp dotnet nodejs node react vue nextjs".split(" "),
);

// The topics worth matching on, as facet tokens ("t:self-hosted").
export const topicsOf = (facets: string) => facets.split(" ").filter((t) => t.startsWith("t:") && !BROAD.has(t.slice(2)) && !/^hacktoberfest/.test(t.slice(2)));
