import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { allowance, BudgetError, PRICES, release, reserve, settle, type PoolName } from "@/lib/budget";
import { getGuide, saveGuide } from "@/lib/db";
import { GitHubError, parseRepoUrl } from "@/lib/github";
import { analyzeGate } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";
import { OS_LABEL, OS_LIST, type OS } from "@/lib/os";
import { isPro } from "@/lib/pro";
import { PRO_ENABLED } from "@/lib/stripe";
import { viewer } from "@/lib/viewer";

// "Write my guide": a step-by-step guide written by Claude for one repo and system, saved for everyone once written.
// Reading a saved guide is free and needs nothing. Writing a new one costs real money (Opus), so it needs GitHub
// sign-in: one a day on the free plan, up to 20 with Pro, paid for from a budget with a daily cap (lib/budget.ts).
const MODEL = "claude-opus-5-5" as const;
const MAX_OUTPUT = 16000;

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

const text = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers } });

// For the button: is there a saved guide for this repo and system, and if not, can this visitor write one?
//   GET /api/guide?url=owner/name&os=mac → { saved, signedIn, pro, left, proOffer }
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ref = parseRepoUrl(q.get("url") ?? "");
  const os = q.get("os") as OS;
  if (!ref || !OS_LIST.includes(os) || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Expected ?url=owner/name&os=…" }, { status: 400 });
  let saved = false;
  try {
    const { key } = await loadRepo(ref, { gate: analyzeGate(req.headers) });
    saved = Boolean(await getGuide(key, os));
  } catch {}
  const { user, settle: settleCookies } = await viewer();
  const pro = user ? await isPro(user.id) : false;
  const left = user ? await allowance(pro ? "guidePro" : "guide", String(user.id)) : null;
  return settleCookies(
    NextResponse.json(
      { saved, signedIn: Boolean(user), pro, left: left ? left.limit - left.used : null, proOffer: PRO_ENABLED() },
      { headers: { "Cache-Control": "private, no-store" } },
    ),
  );
}

export async function POST(req: Request) {
  // Only a repo name comes from the browser; the files are loaded here, so the endpoint can't be used as a general-purpose Claude proxy.
  const { url, os: rawOs } = (await req.json().catch(() => ({}))) as { url?: string; os?: OS };
  const ref = url ? parseRepoUrl(url) : null;
  if (!ref) return new Response("Expected { url, os }", { status: 400 });
  // Written guides are optional: without a key the button isn't shown, and this says so to anyone calling it directly.
  if (!process.env.ANTHROPIC_API_KEY) return new Response("**Written guides aren't available on this site.**", { status: 404 });
  const os: OS = rawOs && OS_LIST.includes(rawOs) ? rawOs : "linux";

  let loaded;
  try {
    loaded = await loadRepo(ref, { gate: analyzeGate(req.headers) });
  } catch (err) {
    return new Response(`**Error:** ${err instanceof GitHubError ? err.message : "Couldn't load the repository."}`, { status: 502 });
  }
  const { key, data } = loaded;
  const { meta, analysis, install, files } = data;

  // Each repo and OS is written once and then served from the database, to anyone.
  const saved = await getGuide(key, os);
  if (saved) return text(saved, 200, { "X-Guide-Cached": "1" });

  // A new guide: signed in, within the day's allowance (free or Pro).
  const { user, settle: settleCookies } = await viewer();
  if (!user) return text("**Sign in with GitHub to write a new guide.** Saved guides are free to read.", 401);
  const pro = await isPro(user.id);
  const pool: PoolName = pro ? "guidePro" : "guide";

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

  // Held before Claude is called: the most this guide can cost (its whole prompt at about 3 characters a token,
  // and the full output allowance), replaced by what it really cost once it's written.
  const price = PRICES[MODEL];
  const worst = Math.ceil(((SYSTEM.length + prompt.length) / 3) * price.input + MAX_OUTPUT * price.output);
  let reservation;
  try {
    reservation = await reserve({ pool, account: String(user.id), requestId: randomUUID(), model: MODEL, repo: meta.fullName, amount: worst });
  } catch (e) {
    if (!(e instanceof BudgetError)) throw e;
    const message =
      e.reason === "answers"
        ? pro
          ? "You've written 20 new guides today, the fair-use limit. It resets at midnight UTC."
          : `You've written today's free guide. Come back tomorrow${PRO_ENABLED() ? ", or get Pro for up to 20 a day" : ""}.`
        : e.reason === "busy"
          ? "A guide is already being written for you. Wait for it to finish."
          : e.reason === "site"
            ? "New guides are paused for today. Saved guides, the manual and the steps above still work."
            : "New guides are paused for a moment. Try again later.";
    return settleCookies(new NextResponse(`**${message}**`, { status: e.reason === "unavailable" ? 503 : 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(e.retryAfter) } }));
  }
  if (reservation.duplicate) return text("**This guide is already being written.**", 409);
  const spendKey = reservation.key;

  const client = new Anthropic();
  const encoder = new TextEncoder();

  let started = false;
  let settled = false;
  const body = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: MAX_OUTPUT,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages: [{ role: "user", content: prompt }],
        });
        let written = "";
        for await (const event of stream) {
          started = true;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            written += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        await settle(spendKey, MODEL, [final.usage]);
        settled = true;
        if (final.stop_reason === "end_turn" && written) await saveGuide(key, os, written);
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n_The model declined to generate this guide._"));
        if (final.stop_reason === "max_tokens") controller.enqueue(encoder.encode("\n\n_…output truncated._"));
      } catch (err) {
        // Visitors get a plain message; the details go to the server log.
        console.error("guide:", err);
        const msg =
          err instanceof Anthropic.RateLimitError
            ? "Too many guides are being written right now. Try again in a minute."
            : "Couldn't write the guide right now. Try again later.";
        controller.enqueue(encoder.encode(`\n\n**Error:** ${msg}`));
      } finally {
        // Nothing reached Claude: the guide is given back. Failed partway: its cost is unknown, so the worst case stays.
        if (!started && !settled) await release(spendKey);
        controller.close();
      }
    },
  });

  return settleCookies(new NextResponse(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }));
}
