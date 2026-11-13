"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { commandRisks, type Citations } from "@/lib/checks";
import { OS_LABEL, type OS } from "@/lib/os";
import { proUrl } from "@/lib/site";
import { CopyButton } from "./ui";

// "Ask about this repo": chat for people signed in with GitHub, answered from the repo's own files
// (app/api/chat). The history stays on the server; this keeps only what's on screen. Commands get their copy
// button only after the whole answer has arrived and been checked, never while it's still streaming.
// It opens in a drawer from a floating button, so the manual stays in view while you ask: beside the page on wide
// screens (the page narrows rather than being covered), as a sheet from the bottom on phones. Closing it keeps the
// conversation; #ask in the URL opens it, which is how it comes back open after signing in.

type Status = {
  enabled: boolean;
  signedIn?: boolean;
  login?: string | null;
  pro?: boolean; // GitManual Pro: no daily limit to show
  proOffer?: boolean; // /pro is open, so running out can point there
  allowance?: { used: number; limit: number } | null;
};

type Answer = {
  role: "assistant";
  text: string;
  reading: string[];
  notices: string[];
  checked: boolean; // the answer has finished: copy buttons and warnings show
  citations?: Citations;
  error?: string;
  upgrade?: boolean; // the free answers ran out: offer Pro
};
type Turn = { role: "user"; text: string } | Answer;

const SAVED_QUESTION = "gitmanual-chat-question:";
const DAILY = 10; // lib/budget.ts, user pool

// The chat on screen is kept in this browser for as long as the server keeps the conversation (CHAT.conversationMs
// in lib/chat.ts), so a refresh or a later visit picks it up. It's only for showing: what Claude sees always comes
// from the server's copy.
const SAVED_CHAT = "gitmanual-chat:";
const SEEN_CHAT = "gitmanual-chat-seen";
const CONVERSATION_MS = 60 * 60 * 1000;
type Conversation = { id: string; commit: string; expiresAt: number };
type SavedChat = { login: string; conversation: Conversation; turns: Turn[] };

function loadChat(repo: string, login: string): SavedChat | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_CHAT + repo) ?? "null") as SavedChat | null;
    if (saved?.login === login && saved.conversation.expiresAt > Date.now() && saved.turns.length) return saved;
  } catch {}
  localStorage.removeItem(SAVED_CHAT + repo);
  return null;
}

export function Chat({ repo, os }: { repo: string; os: OS }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [back, setBack] = useState("/");
  const [open, setOpen] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBack(`${window.location.pathname}${window.location.search}#ask`);
    if (window.location.hash === "#ask") setOpen(true);
    fetch("/api/chat", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, []);

  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  // The chat from before a refresh, if it's still going on the server.
  const login = status?.signedIn ? status.login : null;
  const restored = useRef(false);
  useEffect(() => {
    if (!login) return;
    const saved = loadChat(repo, login);
    if (saved) {
      setTurns(saved.turns);
      setConversation(saved.conversation);
    }
    restored.current = true;
  }, [login, repo]);

  // Saved once each answer has finished, so a half-streamed one is never what comes back.
  useEffect(() => {
    if (!login || !restored.current || busy) return;
    if (conversation && turns.length) localStorage.setItem(SAVED_CHAT + repo, JSON.stringify({ login, conversation, turns } satisfies SavedChat));
    else localStorage.removeItem(SAVED_CHAT + repo);
  }, [login, repo, conversation, turns, busy]);

  // A question typed before signing in waits in the box when they come back (it isn't sent on its own).
  useEffect(() => {
    if (!status?.signedIn) return;
    const saved = sessionStorage.getItem(SAVED_QUESTION + repo);
    if (saved) setQuestion(saved);
    sessionStorage.removeItem(SAVED_QUESTION + repo);
  }, [status?.signedIn, repo]);

  if (!status?.enabled) return null;

  const drawer = (head: ReactNode, body: ReactNode) => (
    <Drawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} head={head}>
      {body}
    </Drawer>
  );

  const signedIn = Boolean(status.signedIn);
  const signInUrl = `/api/github/connect?signin=1&back=${encodeURIComponent(back)}`;
  const examples = [`How do I install it on ${OS_LABEL[os]}?`, "What do I need installed first?", "It says a port is already in use. What now?", "How do I update to a new version?"];
  const pick = (q: string) => {
    setQuestion(q);
    document.querySelector<HTMLTextAreaElement>("#chat-drawer textarea")?.focus();
  };

  const update = (fn: (a: Answer) => Answer) =>
    setTurns((t) => {
      const last = t[t.length - 1];
      return last?.role === "assistant" ? [...t.slice(0, -1), fn(last)] : t;
    });

  async function ask() {
    const q = question.trim();
    if (busy) return;
    if (!signedIn) {
      if (q) sessionStorage.setItem(SAVED_QUESTION + repo, q);
      window.location.href = signInUrl;
      return;
    }
    if (!q) return;
    setBusy(true);
    setQuestion("");
    setTurns((t) => [...t, { role: "user", text: q }, { role: "assistant", text: "", reading: [], notices: [], checked: false }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // One id per question, so a resend after a dropped connection isn't charged twice.
        body: JSON.stringify({ conversationId: conversation?.id, repo, os, question: q, requestId: crypto.randomUUID() }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; signIn?: boolean; ended?: boolean; upgrade?: boolean };
        if (j.signIn) setStatus((s) => s && { ...s, signedIn: false });
        if (j.ended) {
          setEnded(true);
          setConversation(null);
        }
        update((a) => ({ ...a, error: j.error ?? "Couldn't answer right now. Try again later.", upgrade: j.upgrade, checked: true }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line));
      }
    } catch {
      update((a) => ({ ...a, error: "The connection dropped before the answer finished." }));
    } finally {
      update((a) => ({ ...a, checked: true }));
      setBusy(false);
    }
  }

  function handle(e: any) {
    if (e.type === "start") setConversation((c) => (c?.id === e.conversationId ? c : { id: e.conversationId, commit: e.commit, expiresAt: Date.now() + CONVERSATION_MS }));
    else if (e.type === "text") update((a) => ({ ...a, text: a.text + e.text }));
    else if (e.type === "reading") update((a) => ({ ...a, reading: [...a.reading, e.path] }));
    else if (e.type === "notice") update((a) => ({ ...a, notices: [...a.notices, e.message] }));
    else if (e.type === "checks") update((a) => ({ ...a, citations: e.citations, checked: true }));
    else if (e.type === "error") update((a) => ({ ...a, error: e.message }));
    else if (e.type === "allowance") setStatus((s) => s && { ...s, pro: Boolean(e.pro), allowance: { used: e.used, limit: e.limit } });
  }

  const left = status.allowance ? status.allowance.limit - status.allowance.used : null;
  const fileUrl = (path: string) => `https://github.com/${repo}/blob/${conversation?.commit ?? "HEAD"}/${path}`;

  return drawer(
    turns.length > 0 && (
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() => {
          setTurns([]);
          setConversation(null);
          setEnded(false);
        }}
      >
        New chat
      </button>
    ),
    <>
      <div className="chat-log" ref={log}>
        {turns.length === 0 ? (
          <div className="chat-empty">
            <p className="chat-empty-title">
              Stuck setting up <strong>{repo}</strong>? Ask.
            </p>
            <ul className="chat-how">
              <li>
                <span aria-hidden="true">01</span>GitManual AI Agent reads the repo&apos;s own files, at today&apos;s commit
              </li>
              <li>
                <span aria-hidden="true">02</span>Every fact names the file it came from
              </li>
              <li>
                <span aria-hidden="true">03</span>Risky commands are flagged before you copy them
              </li>
            </ul>
            <p className="chat-try">Try one</p>
            <div className="chat-examples">
              {examples.map((q) => (
                <button type="button" key={q} className={`chat-example${question === q ? " on" : ""}`} onClick={() => pick(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="note chat-intro">Answered from {repo}&apos;s own files, for {OS_LABEL[os]}. Answers can be wrong: read commands before you run them.</p>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <p className="chat-q" key={i}>
              {t.text}
            </p>
          ) : (
            <div className="chat-a" key={i}>
              {t.reading.map((p, j) => (
                <p className="chat-reading" key={j}>
                  Read <code>{p}</code>
                </p>
              ))}
              {!t.text && !t.error && !t.checked && (
                <p className="chat-reading">
                  <span className="spinner" /> Reading the repo…
                </p>
              )}
              {t.text && (
                <div className="prose">
                  <ReactMarkdown components={{ pre: ({ node }) => <ChatCode text={codeText(node)} ready={t.checked} /> }}>{t.text}</ReactMarkdown>
                </div>
              )}
              {t.notices.map((n, j) => (
                <p className="chat-notice" key={j}>
                  {n}
                </p>
              ))}
              {t.error && (
                <p className="chat-error">
                  {t.error}
                  {t.upgrade && (
                    <>
                      {" "}
                      <a href={proUrl(`${back.split("#")[0]}#ask`)}>Get Pro for unlimited answers</a>.
                    </>
                  )}
                </p>
              )}
              {t.citations && <CitationNote citations={t.citations} fileUrl={fileUrl} />}
            </div>
          ),
        )}
      </div>

      {ended ? (
        <p className="note">This chat has ended. Start a new one to keep asking.</p>
      ) : left === 0 ? (
        <p className="note">
          {status.pro ? (
            "You've reached today's fair-use limit. It resets at midnight UTC."
          ) : (
            <>
              You&apos;ve used today&apos;s answers. They come back at midnight UTC; the manual still works.
              {status.proOffer && (
                <>
                  {" "}
                  <a href={proUrl(`${back.split("#")[0]}#ask`)}>Get Pro</a> for unlimited answers.
                </>
              )}
            </>
          )}
        </p>
      ) : (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            maxLength={2000}
            rows={3}
            placeholder={turns.length ? "Ask a follow-up…" : `Ask about setting it up on ${OS_LABEL[os]}…`}
            aria-label="Your question"
            disabled={busy}
          />
          <div className="chat-form-bar">
            <span className="chat-hint">Enter to send · Shift+Enter for a new line</span>
            <button type="submit" className="btn btn-sm btn-go" disabled={busy || (signedIn && !question.trim())}>
              {busy ? (
              <span className="spinner" />
            ) : signedIn ? (
              "Ask"
            ) : (
              <>
                <GitHubIcon /> Sign in to ask
              </>
            )}
            </button>
          </div>
        </form>
      )}
      {!signedIn && (
        <p className="chat-left">Free with GitHub sign-in · {DAILY} answers a day · we see your username, not your repos</p>
      )}
      {status.pro ? (
        <p className="chat-left">
          <span className="chat-pro">Pro</span> · unlimited answers
        </p>
      ) : (
        left !== null &&
        left > 0 && (
          <p className="chat-left">
            {left} of {status.allowance!.limit} answers left today
            {status.proOffer && left <= 3 && (
              <>
                {" "}
                · <a href={proUrl(`${back.split("#")[0]}#ask`)}>Go unlimited</a>
              </>
            )}
          </p>
        )
      )}
    </>,
  );
}

// The floating button and the drawer it opens. Rendered into <body> so no transformed parent on the page can
// shift a fixed panel. Kept mounted while closed (inert, off screen), so closing it loses nothing.
function Drawer({ open, onOpen, onClose, head, children }: { open: boolean; onOpen: () => void; onClose: () => void; head: ReactNode; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;

  // "New" shows until the chat has been opened once in this browser.
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    setMounted(true);
    setFresh(!localStorage.getItem(SEEN_CHAT));
  }, []);
  useEffect(() => {
    if (!open) return;
    localStorage.setItem(SEEN_CHAT, "1");
    setFresh(false);
  }, [open]);

  useEffect(() => {
    document.documentElement.classList.toggle("chat-open", open);
    if (open) (panel.current?.querySelector("textarea, .btn-go") as HTMLElement | null)?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  useEffect(() => () => document.documentElement.classList.remove("chat-open"), []);

  if (!mounted) return null;
  return createPortal(
    <>
      <button ref={trigger} type="button" className="chat-fab" aria-expanded={open} aria-controls="chat-drawer" onClick={onOpen} hidden={open}>
        <AiIcon /> Ask about this repo <span className="ai-tag">AI</span>
        {fresh && <span className="chat-new">New</span>}
      </button>
      {/* Dims the page so the drawer has the focus; clicking it closes the drawer. */}
      <div className={`chat-scrim${open ? " open" : ""}`} aria-hidden="true" onClick={onClose} />
      <aside id="chat-drawer" ref={panel} className={`chat-drawer${open ? " open" : ""}`} aria-label="Ask about this repo" inert={!open}>
        <div className="chat-drawer-head">
          <h2>
            <AiIcon size={18} /> Ask about this repo
          </h2>
          {head}
          <button type="button" className="chat-close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="chat-drawer-body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

// The sparkle people know as "made by AI", so nobody takes the answers for a person's or for official docs.
function AiIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.5 1.5l1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7L1.5 6.5l3.7-1.3z" fill="currentColor" />
      <path d="M12.5 9.5l.65 1.85 1.85.65-1.85.65-.65 1.85-.65-1.85L10 12l1.85-.65z" fill="currentColor" />
    </svg>
  );
}

// A command from an answer. Warnings show as soon as it's on screen; the copy button only once the answer has
// finished, so nothing half-written can be copied.
function ChatCode({ text, ready }: { text: string; ready: boolean }) {
  const risks = commandRisks(text);
  return (
    <div className={`chat-code${risks.length ? " risky" : ""}`}>
      {risks.length > 0 && (
        <p className="risk">
          <strong>Check before running:</strong> {risks.map((r) => r.label).join(" · ")}
        </p>
      )}
      <div className="code">
        <pre translate="no">{text}</pre>
        {ready && <CopyButton text={text} label={risks.length ? "Copy anyway" : "Copy"} />}
      </div>
    </div>
  );
}

// The text of a code block, from the Markdown tree react-markdown passes to `pre`.
function codeText(node: unknown): string {
  const walk = (n: any): string => (n?.type === "text" ? n.value : (n?.children ?? []).map(walk).join(""));
  return walk(node).replace(/\n$/, "");
}

function CitationNote({ citations, fileUrl }: { citations: Citations; fileUrl: (p: string) => string }) {
  const { notRead, missing } = citations;
  if (!notRead.length && !missing.length) return null;
  const list = (paths: string[]) =>
    paths.map((p, i) => (
      <span key={p}>
        {i > 0 && ", "}
        <a href={fileUrl(p)} target="_blank" rel="noreferrer">
          <code>{p}</code>
        </a>
      </span>
    ));
  return (
    <div className="chat-cite">
      {missing.length > 0 && (
        <p>
          <strong>Not found in this repo:</strong> {missing.map((p, i) => <span key={p}>{i > 0 && ", "}<code>{p}</code></span>)}. Fine if the answer
          has you create {missing.length === 1 ? "it" : "them"}; otherwise treat that part with care.
        </p>
      )}
      {notRead.length > 0 && <p>Mentioned but not read by the agent: {list(notRead)}. Open {notRead.length === 1 ? "it" : "them"} to check.</p>}
    </div>
  );
}
