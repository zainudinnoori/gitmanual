import { apiRoute, BadRequest } from "@/lib/api";
import { DIFFICULTIES, searchShelf, SORTS } from "@/lib/catalog";
import { parseOs } from "@/lib/lookup";

export { OPTIONS } from "@/lib/api";

// Search the shelf, like /shelf: GET /api/v1/search?q=ollama&os=windows&sort=stars&page=1&perPage=20
// Read from the database only, so it never counts toward a limit.
export const GET = apiRoute(async (q) => {
  const os = q.get("os");
  const sort = q.get("sort");
  const difficulty = q.get("difficulty");
  const level = DIFFICULTIES.find((d) => d.toLowerCase() === difficulty?.toLowerCase());
  const num = (name: string) => {
    const v = q.get(name);
    if (v === null) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new BadRequest(`${name} must be a whole number.`);
    return n;
  };
  if (os && !parseOs(os)) throw new BadRequest("os must be mac, windows or linux.");
  if (sort && !SORTS.includes(sort as (typeof SORTS)[number])) throw new BadRequest(`sort must be one of ${SORTS.join(", ")}.`);
  if (difficulty && !level) throw new BadRequest(`difficulty must be one of ${DIFFICULTIES.join(", ")}.`);
  return {
    json: await searchShelf({
      q: q.get("q") ?? undefined,
      os: parseOs(os),
      language: q.get("language") ?? undefined,
      difficulty: level,
      minStars: num("minStars"),
      sort: (sort as (typeof SORTS)[number]) ?? undefined,
      rising: q.get("rising") === "true" || q.get("rising") === "1" || undefined,
      page: num("page"),
      perPage: num("perPage"),
    }),
  };
});
