import Anthropic from "@anthropic-ai/sdk";
import { getGuide, saveGuide } from "@/lib/db";
import { GitHubError, parseRepoUrl } from "@/lib/github";
import { analyzeGate, limit, LimitError, limitHeaders, visitor } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";
import { OS_LABEL, OS_LIST, type OS } from "@/lib/os";

const MAX_FILE_CHARS = 12_000;

const SYSTEM = `You write local development setup guides for GitHub repositories.
You are given the repository's key files, a rule-based analysis, and any prebuilt install options for the user's OS. Produce a concise, accurate Markdown guide a developer can follow on a fresh machine:
1. Prerequisites (runtimes with exact versions, tools, services)
2. Step-by-step setup with copy-pasteable shell commands in fenced code blocks
3. Environment variables that must be filled in, and where to get them
4. How to run, test, and verify it works (expected URL/port if known)
5. Common pitfalls you can infer from the files
Prefer what the files say over the analysis when they disagree, and say so briefly. Do not invent commands, versions, or env vars that the files don't support; if something is unclear, say what to check. Keep it skimmable.`;

// Guides stream for a while; give the function room on Vercel.
export const maxDuration = 120;

export async function POST(req: Request) {
  // Only a repo name comes from the browser; the files are loaded here, so the endpoint can't be used as a general-purpose Claude proxy.
  const { url, os: rawOs } = (await req.json().catch(() => ({}))) as { url?: string; os?: OS };
  const ref = url ? parseRepoUrl(url) : null;
  if (!ref) return new Response("Expected { url, os }", { status: 400 });
  const os: OS = rawOs && OS_LIST.includes(rawOs) ? rawOs : "linux";

  let loaded;
  try {
    loaded = await loadRepo(ref, { gate: analyzeGate(req.headers) });
  } catch (err) {
    return new Response(`**Error:** ${err instanceof GitHubError ? err.message : "Couldn't load the repository."}`, { status: 502 });
  }
  const { key, data } = loaded;
  const { meta, analysis, install, files } = data;

  // Each repo and OS is written once and then served from the database.
  const saved = await getGuide(key, os);
  if (saved) return new Response(saved, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Guide-Cached": "1" } });

  // Only new guides cost anything, so only they count.
  try {
    await limit("guide", visitor(req.headers));
  } catch (e) {
    if (e instanceof LimitError) return new Response(`**${e.message}**`, { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", ...limitHeaders(e) } });
    throw e;
  }

  const shell = os === "windows" ? "PowerShell" : os === "mac" ? "zsh" : "bash";
  // Only send this OS's slice to keep the prompt focused.
  const osAnalysis = { ...analysis, steps: analysis.steps?.[os], osNotes: analysis.osNotes?.[os] };
  const osInstall = install && {
    release: install.release && {
      tag: install.release.tag,
      assets: install.release.assets.filter((a) => a.os === os).map(({ name, kind, arch, recommended }) => ({ name, kind, arch, recommended })),
    },
    commands: install.commands.filter((c) => c.os.includes(os)),
  };

  const fileBlocks = Object.entries(files)
    .map(([path, text]) => {
      const body = text.length > MAX_FILE_CHARS ? `${text.slice(0, MAX_FILE_CHARS)}\n…[truncated]` : text;
      return `<file path="${path}">\n${body}\n</file>`;
    })
    .join("\n\n");

  const prompt = `Repository: ${meta.fullName} (branch: ${meta.branch})
Description: ${meta.description ?? "n/a"}

The user is on ${OS_LABEL[os]} and uses ${shell}. Write every command for ${OS_LABEL[os]} (${shell} syntax), and mention OS-specific gotchas.
If prebuilt ${OS_LABEL[os]} downloads or package-manager installs exist, start with a short "Just install it" section, then the from-source setup.

<analysis>
${JSON.stringify(osAnalysis, null, 2)}
</analysis>

<install_options>
${JSON.stringify(osInstall ?? null, null, 2)}
</install_options>

<files>
${fileBlocks}
</files>

Write the setup guide.`;

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.beta.messages.stream({
          model: "claude-opus-5-5",
          max_tokens: 16000,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages: [{ role: "user", content: prompt }],
        });
        let text = "";
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "end_turn" && text) await saveGuide(key, os, text);
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n_The model declined to generate this guide._"));
        if (final.stop_reason === "max_tokens") controller.enqueue(encoder.encode("\n\n_…output truncated._"));
      } catch (err) {
        const msg =
          err instanceof Anthropic.AuthenticationError
            ? "No valid Anthropic credentials. Set ANTHROPIC_API_KEY in .env.local and restart `npm run dev`."
            : err instanceof Anthropic.RateLimitError
              ? "Anthropic rate limit hit — try again shortly."
              : err instanceof Anthropic.APIError
                ? `Anthropic API error ${err.status}: ${err.message}`
                : err instanceof Error && /credentials|api key|apiKey/i.test(err.message)
                  ? "No Anthropic credentials found. Set ANTHROPIC_API_KEY in .env.local and restart `npm run dev`."
                  : `Failed to generate guide: ${err instanceof Error ? err.message : String(err)}`;
        controller.enqueue(encoder.encode(`\n\n**Error:** ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
