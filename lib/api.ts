import { apiCaller, type Caller } from "./apikeys";
import { GitHubError } from "./github";
import { LimitError, limitHeaders } from "./limit";

// Shared by every /api/v1 route: CORS for browser scripts, the optional key (checked, counted, refused if wrong
// or turned off), caching, and errors as { "error": "…" } with the right status. Documented on /developers.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, X-GitHub-Token",
  Vary: "Authorization, X-GitHub-Token",
};

export class BadRequest extends Error {}

type Answer = { json: unknown } | { markdown: string };
type Handler = (q: URLSearchParams, ctx: { caller: Caller; headers: Headers; params: Record<string, string> }) => Promise<Answer & { private?: boolean }>;

// Browsers ask before sending the key or token header from another site.
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" } });
}

export function apiRoute(handler: Handler) {
  return async (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => {
    try {
      const caller = await apiCaller(req.headers);
      const out = await handler(new URL(req.url).searchParams, { caller, headers: req.headers, params: (await ctx?.params) ?? {} });
      // Keyed requests skip the shared cache so each one reaches the server and counts toward the key's usage;
      // private answers aren't kept anywhere.
      const headers = {
        ...CORS,
        "Cache-Control": out.private ? "private, no-store" : caller.kind === "key" ? "private, max-age=3600" : "public, max-age=3600, s-maxage=3600",
      };
      return "markdown" in out
        ? new Response(out.markdown, { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" } })
        : Response.json(out.json, { headers });
    } catch (e) {
      if (e instanceof LimitError) return Response.json({ error: e.message }, { status: 429, headers: { ...CORS, ...limitHeaders(e) } });
      if (e instanceof GitHubError) return Response.json({ error: e.message }, { status: e.status, headers: CORS });
      if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400, headers: CORS });
      console.error("api:", e instanceof Error ? e.message : e);
      return Response.json({ error: "Something went wrong on our side." }, { status: 500, headers: CORS });
    }
  };
}
