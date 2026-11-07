import { apiRoute, BadRequest } from "@/lib/api";
import { alternatives } from "@/lib/catalog";
import { parseOs } from "@/lib/lookup";

export { OPTIONS } from "@/lib/api";

// Similar repos that run on a system, for when this one doesn't: GET /api/v1/alternatives?repo=owner/repo&os=windows
export const GET = apiRoute(async (q, { caller, headers }) => {
  const repo = q.get("repo");
  const os = parseOs(q.get("os"));
  if (!repo) throw new BadRequest("Add ?repo=owner/repo");
  if (!os) throw new BadRequest("Add &os=mac, windows or linux.");
  const { private: priv, ...answer } = await alternatives(repo, os, headers, caller);
  return { json: answer, private: priv };
});
