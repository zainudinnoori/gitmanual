import { getVotes, repoKey } from "./db";
import { docFilename, manualDoc, manualDocMarkdown } from "./document";
import { getHeadSha, GitHubError, parseRepoUrl } from "./github";
import { analyzeGate } from "./limit";
import { SITE } from "./lookup";
import type { OS } from "./os";
import { loadRepo } from "./pipeline";

// A public repo's manual for one system as a file: Markdown for everyone, PDF for GitManual Pro (app/api/download).
export async function manualFile(repo: string, os: OS, format: "md" | "pdf", headers: Headers): Promise<{ body: Uint8Array | string; type: string; filename: string }> {
  const ref = parseRepoUrl(repo);
  if (!ref) throw new GitHubError("Expected a GitHub repo like owner/repo.", 400);
  const { data, analyzedAt } = await loadRepo({ owner: ref.owner, repo: ref.repo }, { gate: analyzeGate(headers) });
  if (data.meta.private) throw new GitHubError("Downloads are for public repos.", 404);
  const [owner, name] = data.meta.fullName.split("/");
  const [votes, commit] = await Promise.all([
    getVotes(repoKey(owner, name)),
    // Which commit this copy describes: the one read, or for copies read before that was recorded, the branch's
    // latest. Best effort: without it the file still says the branch and the date.
    data.meta.commit ?? getHeadSha({ owner, repo: name }, data.meta.branch).catch(() => null),
  ]);
  const doc = manualDoc(data, analyzedAt, SITE, os, { worked: votes.byOs[os]?.worked ?? 0 }, commit);
  if (format === "md") return { body: manualDocMarkdown(doc), type: "text/markdown; charset=utf-8", filename: docFilename(doc, "md") };
  // The design is the private gitmanual-pdf package (lib/pdf-missing.ts stands in when it isn't installed). Only
  // loaded for PDFs: the renderer and fonts are heavy.
  const design = await import("gitmanual-pdf");
  if (!design.available) throw new GitHubError("PDF manuals aren't available on this copy of gitmanual. Markdown is.", 404);
  return { body: new Uint8Array(await design.manualPdf(doc)), type: "application/pdf", filename: docFilename(doc, "pdf") };
}
