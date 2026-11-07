import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { parseRepoUrl } from "@/lib/github";
import { LimitError } from "@/lib/limit";
import { apiCaller } from "@/lib/apikeys";
import { allLists, alternatives, DIFFICULTIES, oneList, searchShelf, SORTS } from "@/lib/catalog";
import { loadForCaller, lookupManual, requestHeaders, SITE } from "@/lib/lookup";
import { manualMarkdown } from "@/lib/manual";
import { buildScript } from "@/lib/script";

// gitmanual as an MCP server (Streamable HTTP, stateless): AI agents ask how to set up a GitHub repo and get the
// same facts as the manual page. Connect with the URL https://gitmanual.com/mcp. An API key (Authorization: Bearer
// gm_…) raises the limits; with one, private repos open with the client's own read-only GitHub token as the
// X-GitHub-Token header. Both are set once in the client's MCP config (see /developers).

const repoField = z.string().min(3).describe('The GitHub repo: "owner/repo" or a github.com link, e.g. "ollama/ollama".');
const osField = z.enum(["mac", "windows", "linux"]);

const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof LimitError ? e.message : e instanceof Error ? e.message : "Couldn't load the repository." }],
});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_setup_manual",
      {
        title: "Get a repo's setup manual",
        description:
          "How to install or run a GitHub repository: whether it works on macOS, Windows or Linux (with reasons), ready-made downloads, install commands from the README, the parts it needs, and step-by-step commands to set it up from source. Facts come from the repo's own files, not guesses.",
        inputSchema: z.object({
          repo: repoField,
          os: osField.optional().describe("Only this system. Leave out for all three."),
          arch: z.enum(["arm64", "x64"]).optional().describe("The user's CPU, for picking the right download (Apple Silicon is arm64)."),
        }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ repo, os, arch }) => {
        try {
          return { content: [{ type: "text", text: manualMarkdown((await lookupManual(repo, { os, arch: arch ?? null })).facts) }] };
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.registerTool(
      "get_setup_script",
      {
        title: "Get a repo's setup script",
        description:
          "One script that sets the repo up on the given system: bash for macOS and Linux, PowerShell for Windows. It stops at the first error, skips what's already installed and never starts servers. Show it to the user to read before running it.",
        inputSchema: z.object({ repo: repoField, os: osField }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ repo, os }) => {
        try {
          const ref = parseRepoUrl(repo);
          if (!ref) throw new Error(`"${repo}" isn't a GitHub repo. Use owner/repo.`);
          const { data } = await loadForCaller(ref, requestHeaders.getStore() ?? new Headers());
          const script = buildScript(data.analysis.steps[os], os, data.meta.fullName, SITE);
          return { content: [{ type: "text", text: `${script.filename}:\n\n${script.text}` }] };
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.registerTool(
      "search_repos",
      {
        title: "Search repos with setup manuals",
        description:
          "Find open-source GitHub repos on gitmanual's shelf: by words in the name or description, by the system they run on, language or difficulty, or only those rising on GitHub this week. Each result links to its setup manual.",
        inputSchema: z.object({
          query: z.string().optional().describe("Words to look for in the repo's name or description."),
          os: osField.optional().describe("Only repos that run on this system."),
          language: z.string().optional().describe('Main language, as GitHub names it, e.g. "Python".'),
          difficulty: z.enum(DIFFICULTIES).optional(),
          sort: z.enum(SORTS).optional().describe("stars (default), recent, popular, or worked (most people got it running)."),
          rising: z.boolean().optional().describe("Only repos rising on GitHub this week."),
          page: z.number().int().min(1).optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query, os, language, difficulty, sort, rising, page }) => {
        try {
          await apiCaller(requestHeaders.getStore() ?? new Headers());
          const r = await searchShelf({ q: query, os, language, difficulty, sort, rising, page, perPage: 15 });
          const lines = r.results.map(
            (x) => `- ${x.repo} (★ ${x.stars.toLocaleString()}, ${x.difficulty})${x.description ? `: ${x.description}` : ""}\n  Manual: ${x.manual}`,
          );
          return { content: [{ type: "text", text: [`${r.total} repos found (page ${r.page} of ${r.pages}).`, ...lines].join("\n") }] };
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.registerTool(
      "get_list",
      {
        title: "Get a curated list of repos",
        description:
          "gitmanual's lists group repos by what they do and where they run, e.g. self-hosted apps for Linux, AI tools for Windows, MCP servers for macOS. Leave out slug to see every list.",
        inputSchema: z.object({ slug: z.string().optional().describe('The list, e.g. "ai-tools-windows". Leave out to get all lists.') }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ slug }) => {
        try {
          await apiCaller(requestHeaders.getStore() ?? new Headers());
          if (!slug) {
            const lists = await allLists();
            return { content: [{ type: "text", text: lists.map((l) => `- ${l.slug}: ${l.title} (${l.repos} repos)`).join("\n") }] };
          }
          const list = await oneList(slug);
          if (!list) throw new Error(`No list called "${slug}". Call get_list without a slug to see them all.`);
          const lines = list.results.map((x) => `- ${x.repo} (★ ${x.stars.toLocaleString()})${x.description ? `: ${x.description}` : ""}`);
          return { content: [{ type: "text", text: [`# ${list.title}`, list.intro, `${list.url}`, "", ...lines].join("\n") }] };
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.registerTool(
      "find_alternatives",
      {
        title: "Find alternatives that run on a system",
        description:
          "When a repo doesn't run (or only partly runs) on the user's system: whether it does, and up to five similar repos that do, judged by shared GitHub topics.",
        inputSchema: z.object({ repo: repoField, os: osField }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ repo, os }) => {
        try {
          const r = await alternatives(repo, os, requestHeaders.getStore() ?? new Headers());
          const lines = r.alternatives.map((a) => `- ${a.repo} (★ ${a.stars.toLocaleString()})${a.description ? `: ${a.description}` : ""}\n  Manual: ${a.manual}`);
          return {
            content: [
              {
                type: "text",
                text: [`${r.repo} on ${os}: ${r.runsOn.headline} (${r.runsOn.verdict})`, "", lines.length ? "Similar repos that run there:" : "No close alternatives on the shelf yet.", ...lines].join("\n"),
              },
            ],
          };
        } catch (e) {
          return fail(e);
        }
      },
    );
  },
  { serverInfo: { name: "gitmanual", version: "1.1.0" } },
);

// Each request runs with its own headers available to the tools, so rate limits count the right visitor.
const serve = (req: Request) => requestHeaders.run(req.headers, () => handler(req));
export { serve as GET, serve as POST, serve as DELETE };
