import { apiRoute } from "@/lib/api";
import { oneList } from "@/lib/catalog";
import { GitHubError } from "@/lib/github";

export { OPTIONS } from "@/lib/api";

// One list and its repos, most stars first: GET /api/v1/lists/ai-tools-windows
export const GET = apiRoute(async (_q, { params }) => {
  const list = await oneList(params.slug ?? "");
  if (!list) throw new GitHubError("No such list. GET /api/v1/lists has them all.", 404);
  return { json: list };
});
