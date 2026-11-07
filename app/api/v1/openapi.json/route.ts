import { ENDPOINTS, ERRORS } from "@/app/developers/endpoints";
import { CORS } from "@/lib/api";
import { SITE } from "@/lib/lookup";

// The API as an OpenAPI 3.1 document, from the same reference as /developers, for Postman, Swagger, code
// generators and AI agents: GET /api/v1/openapi.json
const typeOf = (t: string) => {
  if (t === "number") return { type: "integer" };
  const choices = t.split("|").map((s) => s.trim());
  return choices.length > 1 ? { type: "string", enum: choices } : { type: "string" };
};

export function GET() {
  const paths = Object.fromEntries(
    ENDPOINTS.map((e) => [
      e.path,
      {
        get: {
          operationId: e.id,
          summary: e.title,
          description: `${e.summary}\n\nLimits: ${e.limit}`,
          parameters: e.params.map((p) => ({
            name: p.name,
            in: p.in ?? "query",
            required: Boolean(p.required || p.in === "path"),
            description: p.about,
            schema: typeOf(p.type),
            example: e.example[p.name],
          })),
          responses: {
            "200": {
              description: e.fields.map(([name, type, about]) => `- \`${name}\` (${type}): ${about}`).join("\n"),
              content: { "application/json": { example: JSON.parse(e.response) } }, // trimmed: "…" marks what's cut
            },
            ...Object.fromEntries(
              ERRORS.filter(([code]) => code !== "200").map(([code, name, when]) => [
                code,
                { description: `${name}: ${when}`, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
              ]),
            ),
          },
        },
      },
    ]),
  );
  const doc = {
    openapi: "3.1.0",
    info: {
      title: "gitmanual API",
      version: "1.1.0",
      description: `Setup manuals for GitHub repos, the shelf, lists and alternatives. Works without a key (60 requests an hour); a free key from ${SITE}/developers raises the limits and opens private repos.`,
    },
    externalDocs: { url: `${SITE}/developers` },
    servers: [{ url: SITE }],
    security: [{}, { apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: `Optional gitmanual API key (gm_…), free at ${SITE}/developers.` },
        githubToken: { type: "apiKey", in: "header", name: "X-GitHub-Token", description: "Your own read-only GitHub token, for private repos (with an API key)." },
      },
      schemas: { Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] } },
    },
    paths,
  };
  return Response.json(doc, { headers: { ...CORS, "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
