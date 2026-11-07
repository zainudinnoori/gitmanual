import { apiRoute } from "@/lib/api";
import { allLists } from "@/lib/catalog";

export { OPTIONS } from "@/lib/api";

// Every list (a theme on one system, like "AI tools that run on Windows"): GET /api/v1/lists
export const GET = apiRoute(async () => ({ json: { lists: await allLists() } }));
