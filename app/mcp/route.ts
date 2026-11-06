import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { parseRepoUrl } from "@/lib/github";
import { analyzeGate, LimitError } from "@/lib/limit";
import { lookupManual, requestHeaders, SITE } from "@/lib/lookup";
import { manualMarkdown } from "@/lib/manual";
import { loadRepo } from "@/lib/pipeline";
import { buildScript } from "@/lib/script";

// gitmanual as an MCP server (Streamable HTTP, stateless): AI agents ask how to set up a GitHub repo and get the
// same facts as the manual page. Connect with the URL https://gitmanual.com/mcp.

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
          return { content: [{ type: "text", text: manualMarkdown(await lookupManual(repo, { os, arch: arch ?? null })) }] };
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
          const { data } = await loadRepo(ref, { gate: analyzeGate(requestHeaders.getStore() ?? new Headers()) });
          const script = buildScript(data.analysis.steps[os], os, data.meta.fullName, SITE);
          return { content: [{ type: "text", text: `${script.filename}:\n\n${script.text}` }] };
        } catch (e) {
          return fail(e);
        }
      },
    );
  },
  { serverInfo: { name: "gitmanual", version: "1.0.0" } },
);

// Each request runs with its own headers available to the tools, so rate limits count the right visitor.
const serve = (req: Request) => requestHeaders.run(req.headers, () => handler(req));
export { serve as GET, serve as POST, serve as DELETE };
