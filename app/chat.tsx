"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { commandRisks, type Citations } from "@/lib/checks";
import { OS_LABEL, type OS } from "@/lib/os";
import { CopyButton } from "./ui";

// "Ask about this repo": chat for people signed in with GitHub, answered from the repo's own files
// (app/api/chat). The history stays on the server; this keeps only what's on screen. Commands get their copy
// button only after the whole answer has arrived and been checked, never while it's still streaming.

type Status = { enabled: boolean; signedIn?: boolean; login?: string | null; allowance?: { used: number; limit: number } | null };

type Answer = {
  role: "assistant";
  text: string;
  reading: string[];
  notices: string[];
  checked: boolean; // the answer has finished: copy buttons and warnings show
  citations?: Citations;
  error?: string;
};
type Turn = { role: "user"; text: string } | Answer;

export function Chat({ repo, os }: { repo: string; os: OS }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversation, setConversation] = useState<{ id: string; commit: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [back, setBack] = useState("/");
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBack(window.location.pathname + window.location.search);
    fetch("/api/chat", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, []);

  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  if (!status?.enabled) return null;

  if (!status.signedIn) {
    return (
      <div className="panel chat">
        <h3>Ask about this repo</h3>
        <p className="note">
          Chat with Claude about setting up {repo}, answered from the repo&apos;s own files. Free with a GitHub sign-in, which only tells
          us who you are: it can&apos;t see your repos.
        </p>
        <a className="btn btn-sm btn-go" href={`/api/github/connect?signin=1&back=${encodeURIComponent(back)}`}>
          Sign in with GitHub to chat
        </a>
      </div>
    );
  }

  const update = (fn: (a: Answer) => Answer) =>
    setTurns((t) => {
      const last = t[t.length - 1];
      return last?.role === "assistant" ? [...t.slice(0, -1), fn(last)] : t;
    });

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
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
        const j = (await res.json().catch(() => ({}))) as { error?: string; signIn?: boolean; ended?: boolean };
        if (j.signIn) setStatus((s) => s && { ...s, signedIn: false });
        if (j.ended) {
          setEnded(true);
          setConversation(null);
        }
        update((a) => ({ ...a, error: j.error ?? "Couldn't answer right now. Try again later.", checked: true }));
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
    if (e.type === "start") setConversation({ id: e.conversationId, commit: e.commit });
    else if (e.type === "text") update((a) => ({ ...a, text: a.text + e.text }));
    else if (e.type === "reading") update((a) => ({ ...a, reading: [...a.reading, e.path] }));
    else if (e.type === "notice") update((a) => ({ ...a, notices: [...a.notices, e.message] }));
    else if (e.type === "checks") update((a) => ({ ...a, citations: e.citations, checked: true }));
    else if (e.type === "error") update((a) => ({ ...a, error: e.message }));
    else if (e.type === "allowance") setStatus((s) => s && { ...s, allowance: { used: e.used, limit: e.limit } });
  }

  const left = status.allowance ? status.allowance.limit - status.allowance.used : null;
  const fileUrl = (path: string) => `https://github.com/${repo}/blob/${conversation?.commit ?? "HEAD"}/${path}`;

  return (
    <div className="panel chat">
      <div className="panel-head">
        <div>
          <h3>Ask about this repo</h3>
          <p className="note">Answered from {repo}&apos;s own files, for {OS_LABEL[os]}. Answers can be wrong: read commands before you run them.</p>
        </div>
        {turns.length > 0 && (
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
        )}
      </div>

      {turns.length > 0 && (
        <div className="chat-log" ref={log}>
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
                {t.error && <p className="chat-error">{t.error}</p>}
                {t.citations && <CitationNote citations={t.citations} fileUrl={fileUrl} />}
              </div>
            ),
          )}
        </div>
      )}

      {ended ? (
        <p className="note">This chat has ended. Start a new one to keep asking.</p>
      ) : left === 0 ? (
        <p className="note">You&apos;ve used today&apos;s answers. They come back at midnight UTC; the steps above still work.</p>
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
            rows={2}
            placeholder={turns.length ? "Ask a follow-up…" : `e.g. Which version of Node does this need on ${OS_LABEL[os]}?`}
            disabled={busy}
          />
          <button type="submit" className="btn btn-sm btn-go" disabled={busy || !question.trim()}>
            {busy ? <span className="spinner" /> : "Ask"}
          </button>
        </form>
      )}
      {left !== null && left > 0 && (
        <p className="chat-left">
          {left} of {status.allowance!.limit} answers left today
        </p>
      )}
    </div>
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
      {notRead.length > 0 && <p>Mentioned but not read by Claude: {list(notRead)}. Open {notRead.length === 1 ? "it" : "them"} to check.</p>}
    </div>
  );
}
