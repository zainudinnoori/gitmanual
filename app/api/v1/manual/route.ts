import { apiRoute, BadRequest } from "@/lib/api";
import { lookupManual, parseArch, parseOs } from "@/lib/lookup";
import { manualMarkdown } from "@/lib/manual";

export { OPTIONS } from "@/lib/api";

// A repo's setup manual for scripts and AI agents (documented on /developers):
//   GET /api/v1/manual?repo=ollama/ollama            all systems, JSON
//   GET /api/v1/manual?repo=ollama/ollama&os=mac&arch=arm64&format=md
// Private repos take the caller's own read-only GitHub token as X-GitHub-Token (with an API key); that answer is
// never saved or cached.
export const GET = apiRoute(async (q, { caller, headers }) => {
  const repo = q.get("repo");
  if (!repo) throw new BadRequest("Add ?repo=owner/repo");
  const { facts } = await lookupManual(repo, { os: parseOs(q.get("os")), arch: parseArch(q.get("arch")), headers, caller });
  return { ...(q.get("format") === "md" ? { markdown: manualMarkdown(facts) } : { json: facts }), private: facts.private };
});
