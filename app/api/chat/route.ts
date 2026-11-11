import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { allowance, ANSWER, BudgetError, PRICES, release, reserve, settle, type ChatModel, type Usage } from "@/lib/budget";
import { answer, buildContext, CHAT, type ChatEvent } from "@/lib/chat";
import { createConversation, getConversation, saveConversation } from "@/lib/db";
import { getHeadSha, getRepoFile, getRepoMeta, GitHubError, listPaths, parseRepoUrl } from "@/lib/github";
import { analyzeGate } from "@/lib/limit";
import { OS_LIST, type OS } from "@/lib/os";
import { loadRepo } from "@/lib/pipeline";
import { viewer } from "@/lib/viewer";

// Chat about one public repo, for people signed in with GitHub. The browser sends a question and a conversation id;
// the files, the history and the budget all stay on the server. Off unless CHAT_ENABLED=on (see lib/budget.ts and
// lib/chat.ts for the limits). The answer streams back as one JSON event per line.

export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: { ...NO_STORE, ...headers } });

const chatModel = (): ChatModel => {
  const m = process.env.CHAT_MODEL;
  return m && m in PRICES ? (m as ChatModel) : "claude-sonnet-5-5";
};

const BUDGET_STATUS = { busy: 409, answers: 429, site: 429, unavailable: 503 } as const;

export async function POST(req: Request) {
  if (process.env.CHAT_ENABLED !== "on" || !process.env.ANTHROPIC_API_KEY) return fail("Chat isn't available on this site.", 404);

  const body = (await req.json().catch(() => ({}))) as { conversationId?: string; repo?: string; os?: OS; question?: string; requestId?: string };
  const question = body.question?.trim() ?? "";
  if (!question) return fail("Ask a question.", 400);
  if (question.length > CHAT.questionChars) return fail(`Keep questions under ${CHAT.questionChars.toLocaleString()} characters.`, 400);
  if (!body.os || !OS_LIST.includes(body.os)) return fail("Expected os: mac, windows or linux.", 400);
  if (!body.requestId || !/^[\w-]{8,64}$/.test(body.requestId)) return fail("Expected a requestId.", 400);
  const os = body.os;

  const { user, settle: settleCookies } = await viewer();
  if (!user) return fail("Sign in with GitHub to chat about this repo.", 401, { signIn: true });
  const account = String(user.id);

  // The conversation: continued, or started on the repo's latest commit after checking it's still public.
  let convo;
  try {
    if (body.conversationId) {
      convo = await getConversation(body.conversationId, account);
      if (!convo) return fail("This chat has ended. Start a new one to keep asking.", 404, { ended: true });
      if (convo.answers >= CHAT.answersPerConversation) return fail("This chat has reached its limit. Start a new one to keep asking.", 409, { ended: true });
    } else {
      const ref = body.repo ? parseRepoUrl(body.repo) : null;
      if (!ref) return fail("Expected a GitHub repo like owner/repo.", 400);
      // The site's own token, never the visitor's, so a private repo is never readable here.
      const meta = await getRepoMeta(ref);
      if (meta.private) return fail("Chat is only for public repos.", 403);
      const [owner, name] = meta.fullName.split("/");
      const sha = await getHeadSha({ owner, repo: name }, meta.defaultBranch);
      const { paths } = await listPaths({ owner, repo: name }, sha);
      const started = { id: randomUUID(), account, repo: meta.fullName, sha, paths, expiresAt: Date.now() + CHAT.conversationMs };
      await createConversation(started);
      convo = { ...started, messages: [], answers: 0 };
    }
  } catch (e) {
    if (e instanceof GitHubError) return fail(e.message, e.status === 404 ? 404 : 502);
    console.error("chat:", e);
    return fail("Chat is paused for a moment. The manual and Ask Claude / ChatGPT still work.", 503);
  }

  const [owner, name] = convo.repo.split("/");
  const ref = { owner, repo: name, ref: convo.sha };
  let context: string;
  try {
    // Pinned: the analysis and files come from the chat's commit (cached for 12 hours per commit).
    const { data } = await loadRepo(ref, { gate: analyzeGate(req.headers) });
    context = buildContext(data, convo.sha, convo.paths, false);
  } catch (e) {
    return fail(e instanceof GitHubError ? e.message : "Couldn't read the repository.", e instanceof GitHubError && e.status === 429 ? 429 : 502);
  }

  // Paid for before Claude is called. The browser makes one requestId per question, so a resend isn't charged twice.
  const model = chatModel();
  let reservation;
  try {
    reservation = await reserve({ pool: "user", account, requestId: body.requestId, model });
  } catch (e) {
    if (e instanceof BudgetError) return fail(e.message, BUDGET_STATUS[e.reason], { reason: e.reason }, { "Retry-After": String(e.retryAfter) });
    throw e;
  }
  if (reservation.duplicate) return fail("This question is already being answered.", 409, { reason: "duplicate" });
  const key = reservation.key;
  const conversation = convo;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The browser may leave mid-answer; the answer still finishes and is paid for, so writes just stop.
      let open = true;
      const send = (e: ChatEvent | Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      send({ type: "start", conversationId: conversation.id, repo: conversation.repo, commit: conversation.sha });

      const progress = { started: 0, usages: [] as Usage[] };
      let finished = false;
      try {
        const result = await answer({
          client: new Anthropic(),
          model,
          context,
          history: conversation.messages as Anthropic.MessageParam[],
          question,
          os,
          readFile: (path) => getRepoFile(ref, conversation.sha, path, CHAT.toolFileBytes),
          emit: send,
          deadline: Date.now() + ANSWER.deadlineMs,
          progress,
        });
        finished = true;
        await saveConversation(conversation.id, result.messages, conversation.answers + 1).catch((e) => console.error("chat:", e));
        send({ type: "done", stop: result.stop });
      } catch (e) {
        console.error("chat:", e);
        const message =
          e instanceof Anthropic.RateLimitError ? "Too many people are asking right now. Try again in a minute." : "Couldn't answer right now. Try again later.";
        send({ type: "error", message });
      } finally {
        // Never reached Claude: the answer is given back. Finished: the actual cost replaces the reservation.
        // Failed after a call started: that call's cost is unknown, so the reservation is left to expire at its
        // full worst case rather than recorded as less than it may have been.
        if (progress.started === 0) await release(key);
        else if (finished) await settle(key, model, progress.usages);
        const left = await allowance("user", account);
        if (left) send({ type: "allowance", ...left });
        if (open) controller.close();
      }
    },
    cancel() {
      // Leaving early doesn't cancel the answer; see `send` above.
    },
  });

  return settleCookies(new NextResponse(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", ...NO_STORE } }));
}
