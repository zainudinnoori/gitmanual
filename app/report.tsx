"use client";

import { useEffect, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import type { Analysis } from "@/lib/detect";
import type { Guides } from "@/lib/guides";
import type { Alternative } from "@/lib/db";
import { beforeYouStart, type Fact } from "@/lib/facts";
import type { Pick } from "@/lib/picks";
import { fitCheck, freshness, setupTime } from "@/lib/fit";
import { compactCount } from "@/lib/format";
// import { setupFlow } from "@/lib/flow"; — for the route diagram, see `flow` in Report
import type { Arch, Asset, InstallKind, InstallOptions } from "@/lib/install";
import { OS_LABEL, OS_LIST, OS_SLUG, type OS } from "@/lib/os";
import { buildScript } from "@/lib/script";
// import { FlowMap } from "./flow"; — the route diagram, off the page for now
import { disconnect, fetchPrivate, PrivateAccess } from "./private";
import { CarbonAd } from "./carbon";
import { CodeBlock, CopyButton, RepoForm, Wrenches, detectArch, detectOS } from "./ui";

type Result = {
  meta: {
    fullName: string;
    description: string | null;
    branch: string;
    language: string | null;
    stars: number;
    license: string | null;
    htmlUrl: string;
    pushedAt: string;
    openIssues: number;
    topics: string[];
    archived: boolean;
    homepage: string | null;
    private?: boolean;
    createdAt?: string;
    ownerType?: "User" | "Organization";
    fileCount: number;
    treeTruncated: boolean;
  };
  analysis: Analysis;
  install: InstallOptions;
  guides: Guides;
  files: Record<string, string>;
  analyzedAt: number;
  cached: boolean;
  stale?: boolean;
  votes: Votes;
};

type Votes = { worked: number; stuck: number; byOs: Record<string, { worked: number; stuck: number }> };

export type Mode = "install" | "source";

function archLabel(arch: Arch | null, os: OS): string | null {
  if (!arch) return null;
  if (arch === "universal") return "Universal";
  if (arch === "arm64") return os === "mac" ? "Apple Silicon" : "ARM64";
  if (arch === "x64") return os === "mac" ? "Intel" : "x64";
  if (arch === "x86") return "32-bit";
  return "ARMv7";
}

// README links are relative to the repo; point them at GitHub so they work here.
function repoUrl(url: string, key: string, htmlUrl: string, branch: string): string {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) return defaultUrlTransform(url);
  const path = url.replace(/^\.?\//, "");
  const base = key === "src" ? `${htmlUrl.replace("github.com", "raw.githubusercontent.com")}/${branch}` : `${htmlUrl}/blob/${branch}`;
  return defaultUrlTransform(`${base}/${path}`);
}

function formatSize(bytes: number): string {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const inline = { p: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
// README code blocks: code-highlighting browser extensions (Prism) add a class and tabindex to <pre> before React
// loads, which React reports as a hydration mismatch. Only the <pre>'s own attributes are let through.
const blocks = { pre: ({ node: _node, ...props }: React.ComponentProps<"pre"> & { node?: unknown }) => <pre suppressHydrationWarning {...props} /> };

const LOADING_LINES = ["Opening the box…", "Reading the README…", "Counting the parts…", "Checking your device…", "Writing the steps…"];

export type { Result as ReportData };

export function defaultMode(r: Result): Mode {
  // Device-only downloads (.apk) are usually extras; the computer-side setup is the main path then.
  return r.install.platforms.length || r.install.commands.length ? "install" : "source";
}

// Without a server key, "Still stuck?" hands the manual to the visitor's own AI chat: the prompt goes in the link,
// and nothing is sent anywhere until they open it. Commands are trimmed so the link stays a sensible length.
function askPrompt(result: Result, os: OS, arch: Arch | null): string {
  const { meta, analysis: a } = result;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const shell = os === "windows" ? "PowerShell" : os === "mac" ? "zsh" : "bash";
  const chip = archLabel(arch, os);
  const needs = [...a.runtimes.map((r) => (r.detail ? `${r.name} ${r.detail}` : r.name)), ...a.tools, ...a.packageManagers.map((p) => p.name), ...a.services.map((s) => s.name)];
  const steps = a.steps[os].slice(0, 6).map((s, i) => {
    const cmds = s.commands.slice(0, 3).map((c) => (c.length > 120 ? `${c.slice(0, 117)}...` : c));
    return `${i + 1}. ${s.title}${cmds.length ? `: ${cmds.join(" ; ")}` : ""}`;
  });
  return [
    `I'm trying to set up ${meta.fullName} (${meta.htmlUrl}) on ${OS_LABEL[os]}${chip ? ` (${chip})` : ""} and I'm stuck.`,
    `Its setup manual on gitmanual: ${site}/${meta.fullName}/${OS_SLUG[os]}`,
    needs.length ? `It needs: ${needs.join(", ")}.` : "",
    steps.length ? `Suggested steps:\n${steps.join("\n")}` : "",
    `Walk me through the setup one step at a time, with ${shell} commands for ${OS_LABEL[os]}. Check the repo's README if you can. Before each step, tell me how to check it worked, and ask me for the exact error message if something fails.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function AskAi({ prompt, os }: { prompt: string; os: OS }) {
  const q = encodeURIComponent(prompt);
  return (
    <div className="panel ai">
      <div className="panel-head">
        <div>
          <h3>Still stuck? Ask an AI</h3>
          <p className="note">Opens a chat with this manual already filled in, for {OS_LABEL[os]}. It uses your own account; gitmanual sends nothing.</p>
        </div>
      </div>
      <div className="ask-ai">
        <a className="btn btn-sm btn-go" href={`https://claude.ai/new?q=${q}`} target="_blank" rel="noreferrer">
          Ask Claude
        </a>
        <a className="btn btn-sm" href={`https://chatgpt.com/?q=${q}`} target="_blank" rel="noreferrer">
          Ask ChatGPT
        </a>
        <CopyButton text={prompt} className="btn btn-sm" label="Copy the prompt" />
      </div>
    </div>
  );
}

// The page server-renders the manual (initial / initialError) so search engines and first paint get the real steps;
// the browser then switches to the visitor's own system. Fetching here only happens on "Re-read the repo".
export function ReportView({
  owner,
  repo,
  gitRef,
  initial = null,
  initialError = null,
  initialStatus = null,
  githubApp = false,
  initialOs = "mac",
  initialMode,
  picks = [],
  curator = "",
  aiGuide = false,
  osPage = null,
  alternatives = {},
  related = {},
}: {
  // Similar repos that run on the systems this one doesn't (see manual.tsx).
  alternatives?: Partial<Record<OS, Alternative[]>>;
  // Similar repos that run on each system, shown on every manual (see manual.tsx).
  related?: Partial<Record<OS, Alternative[]>>;
  // Set on /owner/repo/windows etc.: that system is the page's subject, so it isn't swapped for the visitor's.
  osPage?: OS | null;
  picks?: Pick[];
  curator?: string;
  // "Write my guide" only shows when the server has an Anthropic key.
  aiGuide?: boolean;
  owner: string;
  repo: string;
  gitRef?: string;
  initial?: Result | null;
  initialError?: string | null;
  // 404 may mean private: the page then offers to open it with the visitor's own GitHub access (app/private.tsx).
  initialStatus?: number | null;
  githubApp?: boolean;
  initialOs?: OS;
  initialMode?: Mode;
}) {
  const [result, setResult] = useState<Result | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [line, setLine] = useState(0);
  const [guide, setGuide] = useState("");
  const [guideLoading, setGuideLoading] = useState(false);
  const [os, setOs] = useState<OS>(initialOs);
  const [detectedOs, setDetectedOs] = useState<OS | null>(null);
  const [arch, setArch] = useState<Arch | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode ?? (initial ? defaultMode(initial) : "source"));
  const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState<number | null>(initialStatus);
  // Opened with the visitor's GitHub access: re-reads go the same way, and nothing about it is saved.
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    const d = detectOS();
    setDetectedOs(d);
    detectArch().then(setArch);
    const q = new URLSearchParams(window.location.search);
    const qOs = q.get("os") as OS | null;
    setOs(osPage ?? (qOs && OS_LIST.includes(qOs) ? qOs : d));
    const qMode = q.get("mode");
    if (refresh === 0 && (initial || initialError)) return;

    let cancelled = false;
    setResult(null);
    setLine(0);
    const tick = setInterval(() => setLine((l) => Math.min(l + 1, LOADING_LINES.length - 1)), 900);
    const url = `${owner}/${repo}${gitRef ? `/tree/${gitRef}` : ""}`;
    (isPrivate
      ? fetchPrivate(url)
      : fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, fresh: refresh > 0 }),
        })
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus(res.status);
          throw new Error(data.error ?? "Request failed");
        }
        if (cancelled) return;
        setResult(data);
        setMode(qMode === "install" || qMode === "source" ? qMode : defaultMode(data));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => clearInterval(tick));
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
    // initial/initialError only matter for the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, gitRef, refresh]);

  // Guides are written per OS.
  useEffect(() => setGuide(""), [os]);

  // Keep the chosen OS and tab in the URL so a setup can be shared or bookmarked.
  useEffect(() => {
    if (!result) return;
    const params = new URLSearchParams(window.location.search);
    params.set("mode", mode);
    // On a per-system page the system is in the path, so switching moves to that system's page.
    if (osPage) params.delete("os");
    else params.set("os", os);
    const path = osPage ? `/${result.meta.fullName}/${OS_SLUG[os]}` : window.location.pathname;
    window.history.replaceState(null, "", `${path}?${params}`);
  }, [result, os, mode, osPage]);

  async function generateGuide() {
    if (!result) return;
    setGuide("");
    setGuideLoading(true);
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `${result.meta.fullName}${gitRef ? `/tree/${gitRef}` : ""}`, os }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setGuide((g) => g + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      setGuide((g) => `${g}\n\n**Error:** ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGuideLoading(false);
    }
  }

  if (error && (status === 404 || isPrivate)) {
    return (
      <PrivateAccess<Result>
        owner={owner}
        repo={repo}
        gitRef={gitRef}
        appAvailable={githubApp}
        onLoaded={(r) => {
          setIsPrivate(true);
          setError(null);
          setResult(r);
          const qMode = new URLSearchParams(window.location.search).get("mode");
          setMode(qMode === "install" || qMode === "source" ? qMode : defaultMode(r));
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="wrap report-state">
        <p className="eyebrow">Missing parts</p>
        <h1 className="display-md">We couldn&apos;t open {owner}/{repo}</h1>
        <p className="lead">{error}</p>
        <RepoForm initial={`${owner}/${repo}`} size="sm" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="wrap report-state" aria-busy="true">
        <div className="unbox" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow" translate="no">
          {owner}/{repo}
        </p>
        <h1 className="display-md" aria-live="polite">
          {LOADING_LINES[line]}
        </h1>
      </div>
    );
  }

  return (
    <Report
      result={result}
      os={os}
      detectedOs={detectedOs}
      arch={arch}
      onOs={setOs}
      mode={mode}
      onMode={setMode}
      guide={guide}
      guideLoading={guideLoading}
      onGuide={generateGuide}
      picks={picks}
      curator={curator}
      aiGuide={aiGuide}
      osPage={Boolean(osPage)}
      alternatives={alternatives}
      related={related}
      onRefresh={() => setRefresh((n) => n + 1)}
      onDisconnect={async () => {
        await disconnect();
        setResult(null);
        setStatus(404);
        setError("disconnected");
      }}
      onVotes={(votes) => setResult((r) => r && { ...r, votes })}
    />
  );
}

function Report({
  result,
  os,
  detectedOs,
  arch,
  onOs,
  mode,
  onMode,
  guide,
  guideLoading,
  onGuide,
  onRefresh,
  onDisconnect,
  onVotes,
  picks,
  curator,
  aiGuide,
  osPage,
  alternatives,
  related,
}: {
  alternatives: Partial<Record<OS, Alternative[]>>;
  related: Partial<Record<OS, Alternative[]>>;
  picks: Pick[];
  curator: string;
  aiGuide: boolean;
  osPage: boolean;
  result: Result;
  os: OS;
  detectedOs: OS | null;
  arch: Arch | null;
  onOs: (os: OS) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  guide: string;
  guideLoading: boolean;
  onGuide: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onVotes: (v: Votes) => void;
}) {
  const { meta, analysis: a, install, guides, files } = result;
  // Private manuals are for the visitor alone: no votes, sharing, badge or saved AI guide, and the script is made here.
  const priv = Boolean(meta.private);
  const steps = a.steps[os];
  const myArch = os === detectedOs ? arch : null;
  const fit = fitCheck(a, install, os, myArch, meta.archived);
  // "More like this" leaves out what the alternatives box above already shows.
  const altsShown = fit.status !== "yes" ? (alternatives[os] ?? []).map((r) => r.fullName) : [];
  const moreLike = (related[os] ?? []).filter((r) => !altsShown.includes(r.fullName));
  // The route diagram ("How it fits together", app/flow.tsx) is off the page for now: it made the page heavier
  // than the three answers people come for. Its Mermaid still goes out with the API, Markdown and MCP.
  // const flow = setupFlow(a, install, os);
  const fresh = freshness(meta.pushedAt);
  const level = { Easy: 1, Moderate: 2, Involved: 3 }[a.difficulty.label];
  const setup = buildScript(steps, os, meta.fullName, process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  const setupFile = `/${meta.fullName}/setup/${os === "windows" ? "windows.ps1" : `${os}.sh`}`;
  const md = (text: string) => (
    <ReactMarkdown components={blocks} urlTransform={(url, key) => repoUrl(url, key, meta.htmlUrl, meta.branch)}>
      {text}
    </ReactMarkdown>
  );

  const parts = [
    ...(a.needsDevice ? [{ name: "Your device", detail: undefined, kind: "phone, tablet or TV with ADB" }] : []),
    ...a.runtimes.map((r) => ({ name: r.name, detail: r.detail, kind: "runtime" })),
    ...a.tools.map((t) => ({ name: t, detail: undefined, kind: "tool" })),
    ...a.packageManagers.map((p) => ({ name: p.name, detail: p.detail, kind: "package manager" })),
    ...a.services.map((s) => ({ name: s.name, detail: undefined, kind: "service" })),
  ];

  return (
    <div className="wrap report">
      <header className="sheet-head">
        <div>
          <p className="eyebrow">{osPage ? `How to install on ${OS_LABEL[os]}` : "Assembly instructions"}</p>
          <h1 className="display-md repo-title" translate="no">
            <a href={meta.htmlUrl} target="_blank" rel="noreferrer">
              <span className="owner">{meta.fullName.split("/")[0]}/</span>
              <wbr />
              {meta.fullName.split("/")[1]}
            </a>
          </h1>
          {meta.description && <p className="lead">{meta.description}</p>}
          <div className="chips">
            {(a.stacks.length ? a.stacks : [meta.language ?? "Unknown stack"]).map((s) => (
              <span className="chip" key={s}>
                {s}
              </span>
            ))}
            {meta.topics.slice(0, 4).map((t) => (
              <span className="chip ghost" key={t}>
                #{t}
              </span>
            ))}
          </div>
          <BeforeYouStart facts={beforeYouStart(result)} />
        </div>
        <div className="head-side">
          <dl className="spec">
            <div>
              <dt>Difficulty</dt>
              <dd>
                <Wrenches n={level} /> {a.difficulty.label}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{setupTime(a.difficulty.score)}</dd>
            </div>
            <div>
              <dt>Stars</dt>
              <dd className="num">★ {meta.stars.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Activity</dt>
              <dd>
                <span className={`dot ${fresh.tone}`} />
                {fresh.label}
              </dd>
            </div>
            {!priv && result.votes.worked > 0 && (
              <div>
                <dt>Got it running</dt>
                <dd className="num">
                  {result.votes.worked} {result.votes.worked === 1 ? "person" : "people"}
                </dd>
              </div>
            )}
          </dl>
          {!priv && <CarbonAd className="ad-head" />}
        </div>
      </header>

      {priv ? (
        <p className="stamp-line private-line">
          <span className="private-tag">Private</span> Built just for you {timeAgo(result.analyzedAt)}, and not saved anywhere. Cloning it
          needs your own GitHub sign-in on this computer (<code>gh auth login</code> or an SSH key).
          <button className="link" onClick={onRefresh}>
            Re-read the repo
          </button>
          <button className="link" onClick={onDisconnect}>
            Disconnect
          </button>
        </p>
      ) : (
      <p className="stamp-line">
        {result.stale ? "GitHub didn't answer, so this is the saved copy from " : result.cached ? "Saved setup from " : "Fresh setup, read "}
        {timeAgo(result.analyzedAt)}
        {result.cached && (
          <button className="link" onClick={onRefresh}>
            Re-read the repo
          </button>
        )}
      </p>
      )}

      <section className={`fit fit-${fit.status}`} aria-labelledby="fit-h">
        <div className="fit-stamp" aria-hidden="true">
          {fit.status === "yes" ? "✓" : fit.status === "maybe" ? "?" : "✕"}
        </div>
        <div className="fit-body">
          <p className="eyebrow">Will it work on {OS_LABEL[os]}?</p>
          <h2 id="fit-h">{fit.headline}</h2>
          <ul>
            {fit.reasons.map((r) => (
              <li key={r}>
                <ReactMarkdown components={inline}>{r}</ReactMarkdown>
              </li>
            ))}
          </ul>
          {a.compatibility && (
            <details className="fit-list">
              <summary>Supported devices from the README: {a.compatibility.heading}</summary>
              <div className="prose">{md(a.compatibility.markdown)}</div>
            </details>
          )}
        </div>
        <div className="fit-device">
          <span className="eyebrow">Your system</span>
          <div className="seg" role="radiogroup" aria-label="Operating system">
            {OS_LIST.map((o) => (
              // Real links, so search engines find each system's page; clicking just switches in place.
              <a
                key={o}
                href={`/${meta.fullName}/${OS_SLUG[o]}`}
                role="radio"
                aria-checked={o === os}
                className={o === os ? "on" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  onOs(o);
                }}
              >
                {OS_LABEL[o]}
                {o === detectedOs && <span className="you">you</span>}
              </a>
            ))}
          </div>
          {myArch && <span className="note">Your chip: {archLabel(myArch, os)}</span>}
        </div>
      </section>

      {fit.status !== "yes" && (alternatives[os]?.length ?? 0) > 0 && (
        <aside className="alts" aria-labelledby="alts-h">
          <h3 id="alts-h">
            {fit.status === "no" ? `Doesn't run on ${OS_LABEL[os]}? These similar projects do.` : `Prefer one that's sure to run on ${OS_LABEL[os]}? These similar projects do.`}
          </h3>
          <AltCards list={alternatives[os]!} os={os} />
        </aside>
      )}

      <StartHere
        meta={meta}
        guides={guides}
        os={os}
        way={installWay(install, os)}
        steps={steps.length}
        analysis={a}
        onGo={(id, m) => {
          if (m) onMode(m);
          requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
      />
      {/* <FlowMap flow={flow} onJump={...} /> — the route diagram, see the note on `flow` above. */}

      <div className="sheet">
        <div className="sheet-main">
          <div className="tabs" role="tablist" aria-label="How to set it up" id="main-tabs">
            <button role="tab" aria-selected={mode === "install"} className={mode === "install" ? "on" : ""} onClick={() => onMode("install")}>
              Install it
              {install.platforms.length > 0 && <span className="count">{install.platforms.length}</span>}
            </button>
            <button role="tab" aria-selected={mode === "source"} className={mode === "source" ? "on" : ""} onClick={() => onMode("source")}>
              Build from source
              <span className="count">{steps.length}</span>
            </button>
          </div>

          {mode === "install" ? (
            <InstallPanel install={install} os={os} onSource={() => onMode("source")} />
          ) : (
            <>
              <RepoScript meta={meta} guides={guides} os={os} />
              {guides.doc && (
                <details className="panel guide-doc" id="maintainer-guide" open={steps.length <= 3}>
                  <summary>
                    <span className="eyebrow">From the maintainers</span>
                    <h3>
                      {guides.doc.label}: <code>{guides.doc.path}</code>
                    </h3>
                  </summary>
                  <div className="prose">{md(guides.doc.markdown)}</div>
                  <a className="release" href={`${meta.htmlUrl}/blob/${meta.branch}/${guides.doc.path}`} target="_blank" rel="noreferrer">
                    Open {guides.doc.path} on GitHub ↗
                  </a>
                </details>
              )}
              {a.readmeFirst && a.readme && (
                <div className="panel">
                  <h3>Before you start: {a.readme.heading}</h3>
                  <div className="prose">{md(a.readme.markdown)}</div>
                </div>
              )}
              <div className="steps-head" id="our-steps">
                <h2>
                  {steps.length} steps on {OS_LABEL[os]}
                </h2>
                {setup.steps.length > 1 && (
                  <div className="setup-btns">
                    <CopyButton text={setup.text} className="btn btn-sm" label="Copy as one script" />
                    {priv ? (
                      <button className="btn btn-sm" onClick={() => saveText(setup.filename, os === "windows" ? `\uFEFF${setup.text}` : setup.text)}>
                        Download {setup.filename}
                      </button>
                    ) : (
                      <a className="btn btn-sm" href={`${setupFile}?download=1`} download>
                        Download {setup.filename}
                      </a>
                    )}
                  </div>
                )}
              </div>
              {setup.steps.length > 1 && (
                <p className="setup-how">
                  Then run <code>{os === "windows" ? "powershell -ExecutionPolicy Bypass -File .\\setup.ps1" : "bash setup.sh"}</code>. It stops at
                  the first error and is safe to run again. Servers and tests aren&apos;t started; it lists them at the end.
                  {!priv && (
                    <>
                      {" "}
                      <a href={setupFile} target="_blank" rel="noreferrer">
                        Read it first
                      </a>
                      .
                    </>
                  )}
                </p>
              )}
              <ol className="steps">
                {steps.map((s, i) => (
                  <li key={s.title} className="step">
                    <span className="step-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="step-body">
                      <h3>{s.title}</h3>
                      {s.note && (
                        <p className="note">
                          <ReactMarkdown components={inline}>{s.note}</ReactMarkdown>
                        </p>
                      )}
                      {s.commands.length > 0 && <CodeBlock text={s.commands.join("\n")} />}
                      {s.tips?.map((t) => (
                        <div className="tip" key={t}>
                          <ReactMarkdown components={inline}>{t}</ReactMarkdown>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
              {a.osNotes[os].map((n) => (
                <p className="tip" key={n}>
                  <ReactMarkdown components={inline}>{n}</ReactMarkdown>
                </p>
              ))}
              {steps.length <= 1 && (
                <p className="empty">
                  We couldn&apos;t spot a known stack.{" "}
                  {aiGuide && !priv ? "The AI guide below can read the code for you." : "Start with the README, or ask an AI below to go through it with you."}
                </p>
              )}
              {!a.readmeFirst && a.readme && (
                <details className="panel">
                  <summary>
                    <h3>From the README: {a.readme.heading}</h3>
                  </summary>
                  <div className="prose">{md(a.readme.markdown)}</div>
                </details>
              )}
            </>
          )}

          {!priv && <DidItWork repo={meta.fullName} os={os} votes={result.votes} onVotes={onVotes} />}

          {aiGuide && !priv && (
            <div className="panel ai">
              <div className="panel-head">
                <div>
                  <h3>Still stuck? Get a written guide</h3>
                  <p className="note">
                    Claude reads the {Object.keys(files).length} key files and writes a step-by-step guide for {OS_LABEL[os]}. Once written, it&apos;s saved for everyone.
                  </p>
                </div>
                <button className="btn btn-sm btn-go" onClick={onGuide} disabled={guideLoading || Boolean(guide)}>
                  {guideLoading ? (
                    <>
                      <span className="spinner" />
                      Writing…
                    </>
                  ) : guide ? (
                    "Written"
                  ) : (
                    "Write my guide"
                  )}
                </button>
              </div>
              {guide && <div className="prose">{md(guide)}</div>}
            </div>
          )}
          {(!aiGuide || priv) && <AskAi prompt={askPrompt(result, os, myArch)} os={os} />}

          <Related list={moreLike} name={meta.fullName.split("/")[1]} os={os} />
        </div>

        <aside className="sheet-side">
          <div className="parts" id="parts">
            <h2 className="parts-h">Parts list</h2>
            {parts.length === 0 ? (
              <p className="empty">Nothing extra to install.</p>
            ) : (
              <ul>
                {parts.map((p) => (
                  <li key={`${p.kind}-${p.name}`}>
                    <span className="qty">1×</span>
                    <span>
                      <b>{p.name}</b> {p.detail && <code>{p.detail}</code>}
                      <span className="kind">{p.kind}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {a.envVars.length > 0 && (
              <details className="env">
                <summary>
                  <span className="qty">{a.envVars.length}×</span> settings in <code>.env</code>
                </summary>
                <ul>
                  {a.envVars.slice(0, 60).map((e) => (
                    <li key={e.name}>
                      <code>{e.name}</code>
                      {e.secret && <span className="secret">secret</span>}
                      {e.optional && <span className="optional">optional</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {!priv && (
            <div className="side-card">
              <h3>Share this manual</h3>
              <div className="share-btns">
                <CopyButton text={typeof window === "undefined" ? `/${meta.fullName}` : `${window.location.origin}/${meta.fullName}`} className="btn btn-sm" label="Copy the link" />
                <a className="btn btn-sm" href={`/${meta.fullName}/poster?download=1`} download>
                  Download a 1080×1080 poster
                </a>
              </div>
              {picks.length > 0 && (
                <div className="side-sub">
                  <h4>Featured in {curator}</h4>
                  {picks.slice(0, 2).map((p) => (
                    <a className="featured" key={p.url} href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail of an already-sized poster */}
                      <img src={p.image} alt="" width={76} height={76} loading="lazy" />
                      <span>
                        <b>{p.kind === "reel" ? "▶ Watch the Reel" : "See the poster"} ↗</b>
                        {p.caption ? p.caption.split(/\r?\n/)[0].slice(0, 90) : "On Facebook"}
                      </span>
                    </a>
                  ))}
                </div>
              )}
              <BadgeCard fullName={meta.fullName} />
            </div>
          )}

          {(a.hints.length > 0 || a.otherManifests.length > 0) && (
            <div className="side-card">
              <h3>Good to know</h3>
              <ul className="hints">
                {a.hints.map((h) => (
                  <li key={h}>
                    <ReactMarkdown components={inline}>{h}</ReactMarkdown>
                  </li>
                ))}
                {a.otherManifests.length > 0 && (
                  <li>
                    Nested projects: <code>{a.otherManifests.slice(0, 4).join(", ")}</code>
                    {a.otherManifests.length > 4 ? ` and ${a.otherManifests.length - 4} more` : ""}
                  </li>
                )}
              </ul>
            </div>
          )}

          <details className="side-card">
            <summary>
              <h3>Details</h3>
            </summary>
            <dl className="side-facts">
              <div>
                <dt>License</dt>
                <dd>{meta.license && meta.license !== "NOASSERTION" ? meta.license : "Not detected"}</dd>
              </div>
              <div>
                <dt>Open issues</dt>
                <dd className="num">{meta.openIssues.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>
                  <code>{meta.branch}</code>
                </dd>
              </div>
            </dl>
            {a.scripts.length > 0 && (
              <div className="side-sub">
                <h4>package.json scripts ({a.scripts.length})</h4>
                <ul className="scripts">
                  {a.scripts.slice(0, 25).map((s) => (
                    <li key={s.name}>
                      <code>{s.name}</code>
                      <span>{s.command}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="side-sub">
              <h4>Files we read ({Object.keys(files).length})</h4>
              <div className="files">
                {Object.keys(files)
                  .sort()
                  .map((f) => (
                    <div key={f}>{f}</div>
                  ))}
              </div>
              <p className="note">
                {meta.fileCount.toLocaleString()} files in the repo
                {meta.treeTruncated ? " (large repo, list truncated)" : ""}
              </p>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

function InstallPanel({ install, os, onSource }: { install: InstallOptions; os: OS; onSource: () => void }) {
  const { release } = install;
  const assets = release?.assets.filter((a) => a.os === os) ?? [];
  const recommended = assets.find((a) => a.recommended);
  const others = assets.filter((a) => a !== recommended);
  const commands = install.commands.filter((c) => c.os.includes(os));
  const otherOs = OS_LIST.filter((o) => o !== os && install.platforms.includes(o));
  // Apps the project publishes on its own site rather than in GitHub releases.
  const page = !assets.length && install.downloadPage?.platforms.includes(os) ? install.downloadPage : null;
  const pageCard = page && (
    <div className="panel">
      <div className="panel-head">
        <h3>Download for {OS_LABEL[os]}</h3>
        <a className="btn btn-sm btn-go" href={page.urls[os]} target="_blank" rel="noreferrer">
          Open {page.host} ↗
        </a>
      </div>
      <p className="note">The project publishes its {OS_LABEL[os]} app on its own website, not in GitHub releases. The README links to this page.</p>
    </div>
  );

  const devices = release?.deviceAssets ?? [];
  const deviceCard = devices.length > 0 && release && (
    <div className="panel">
      <div className="panel-head">
        <h3>Install on your Android / TV device</h3>
        <a className="release" href={release.url} target="_blank" rel="noreferrer">
          {release.name} · {new Date(release.publishedAt).toLocaleDateString()} ↗
        </a>
      </div>
      <p className="note">
        This app runs on the device, not on your {OS_LABEL[os]} computer. Download it, then install it from the computer with adb (turn on ADB
        debugging in the device&apos;s Developer Options first).
      </p>
      {devices.map((d) => (
        <div className="asset primary" key={d.name}>
          <div className="asset-head">
            <div>
              <div className="asset-name">{d.name}</div>
              <div className="note">
                Android app · {formatSize(d.size)}
                {d.downloads ? ` · ${d.downloads.toLocaleString()} downloads` : ""}
              </div>
            </div>
            <a className="btn btn-go btn-sm" href={d.url}>
              Download
            </a>
          </div>
          <CodeBlock text={d.commands.join("\n")} />
        </div>
      ))}
    </div>
  );

  if (!assets.length && !commands.length && !page) {
    return (
      <>
        {deviceCard}
        <div className="panel">
          <h3>No {OS_LABEL[os]} app in the box</h3>
          <p className="empty">
            {deviceCard
              ? `Your ${OS_LABEL[os]} computer only needs the tools from the source setup.`
              : `No ready-made ${OS_LABEL[os]} app or install command${release ? ` in ${release.tag}` : " (no GitHub releases)"}.`}
            {otherOs.length > 0 && <> There are apps for {otherOs.map((o) => OS_LABEL[o]).join(" and ")}.</>}
          </p>
          <button className="btn btn-sm" onClick={onSource}>
            Build it from source instead →
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {deviceCard}
      {pageCard}
      {recommended && release && (
        <div className="panel">
          <div className="panel-head">
            <h3>Download for {OS_LABEL[os]}</h3>
            <a className="release" href={release.url} target="_blank" rel="noreferrer">
              {release.name}
              {release.prerelease ? " (pre-release)" : ""} · {new Date(release.publishedAt).toLocaleDateString()} ↗
            </a>
          </div>
          <AssetRow asset={recommended} os={os} primary />
          {others.length > 0 && (
            <details className="more">
              <summary>
                Other {OS_LABEL[os]} downloads ({others.length})
              </summary>
              {others.map((a) => (
                <AssetRow key={a.name} asset={a} os={os} />
              ))}
            </details>
          )}
        </div>
      )}

      {COMMAND_GROUPS.map((g) => {
        const list = commands.filter((c) => c.kind === g.kind);
        if (!list.length) return null;
        return (
          <div className="panel" key={g.kind}>
            <h3>{g.title}</h3>
            {g.note && <p className="note">{g.note}</p>}
            {list.map((c) => (
              <div className="pm-cmd" key={c.command}>
                <span className="method">{c.method}</span>
                <CodeBlock text={c.command} />
                {c.script && <div className="warn">Pipes a remote script into your shell. Read it before running.</div>}
              </div>
            ))}
            <p className="note">From the README, exactly as the maintainers wrote it.</p>
          </div>
        );
      })}
    </>
  );
}

const COMMAND_GROUPS: { kind: InstallKind; title: string; note?: string }[] = [
  { kind: "app", title: "Install with a package manager" },
  { kind: "docker", title: "Run it with Docker", note: "A self-hosted app: Docker runs it on your computer and you open it in the browser. Needs Docker Desktop (or Docker Engine on Linux). Run docker compose commands inside the cloned repo folder." },
  { kind: "scaffold", title: "Start a new project with it", note: "Creates a fresh project folder set up with this framework. Run it where you keep your code, not inside this repo." },
  { kind: "library", title: "Use it in your own project", note: "This is a library: you add it to your code rather than opening an app." },
];

type InstallWay = { tag: string; title: string; sub: string };

// The easiest way to get it, for the "Start here" door. Null when the only way is from source.
function installWay(install: InstallOptions, os: OS): InstallWay | null {
  const label = OS_LABEL[os];
  const cmds = install.commands.filter((c) => c.os.includes(os));
  const app = cmds.find((c) => c.kind === "app");
  if (install.release?.assets.some((a) => a.os === os)) return { tag: "Download", title: "Get the ready-made app", sub: `Built for ${label}. No code needed.` };
  if (install.downloadPage?.platforms.includes(os))
    return { tag: "Download", title: "Get the ready-made app", sub: `From ${install.downloadPage.host}, for ${label}. No code needed.` };
  if (app) return { tag: "Install", title: /script/i.test(app.method) ? "Run the install script" : `Install it with ${app.method}`, sub: `One command on ${label}.` };
  if (install.release?.deviceAssets.length)
    return { tag: "Device app", title: "Install it on your device", sub: "An Android / TV app (.apk), installed from this computer." };
  if (cmds.some((c) => c.kind === "docker")) return { tag: "Docker", title: "Run it with Docker", sub: "Self-hosted: it opens in your browser." };
  const scaffold = cmds.find((c) => c.kind === "scaffold");
  if (scaffold) return { tag: "New project", title: "Start a project with it", sub: scaffold.command };
  const lib = cmds.find((c) => c.kind === "library");
  if (lib) return { tag: "Library", title: "Add it to your project", sub: lib.command };
  return null;
}

function AssetRow({ asset, os, primary }: { asset: Asset; os: OS; primary?: boolean }) {
  const arch = archLabel(asset.arch, os);
  return (
    <div className={`asset${primary ? " primary" : ""}`}>
      <div className="asset-head">
        <div>
          <div className="asset-name">{asset.name}</div>
          <div className="note">
            {asset.kind}
            {arch ? ` · ${arch}` : ""} · {formatSize(asset.size)}
            {asset.downloads ? ` · ${asset.downloads.toLocaleString()} downloads` : ""}
            {primary ? " · best match" : ""}
          </div>
        </div>
        <a className={`btn btn-sm${primary ? " btn-go" : ""}`} href={asset.url}>
          Download
        </a>
      </div>
      {asset.note && <div className="note">{asset.note}</div>}
      <CodeBlock text={asset.commands.join("\n")} />
    </div>
  );
}

// Saves text made in the browser as a file (private manuals have no server copy to download).
function saveText(filename: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function timeAgo(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// The ways in, best first: the maintainers' own website, guide and installer beat our generated steps.
// Is it free, does it use paid AI, is it maintained, can I trust it: what people ask before trying a project.
function BeforeYouStart({ facts }: { facts: Fact[] }) {
  return (
    <section className="facts" aria-labelledby="facts-h">
      <h2 id="facts-h" className="facts-h">
        Before you start
      </h2>
      <dl className="facts-grid">
        {facts.map((f) => (
          <div key={f.q} className={`fact fact-${f.tone}`}>
            <dt>{f.q}</dt>
            <dd>
              <b>{f.a}</b>
              <span title={f.why}>{f.why}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type Door = { id: string; tag: string; title: string; sub: string; go?: () => void; href?: string };

// Similar repos as small cards, each opening its manual on the same system.
function AltCards({ list, os }: { list: Alternative[]; os: OS }) {
  return (
    <ul>
      {list.map((r) => (
        <li key={r.fullName}>
          <a href={`/${r.fullName}/${OS_SLUG[os]}`}>
            <span className="alt-name" translate="no">
              {r.fullName.split("/")[1]}
              <span className="num">★ {compactCount(r.stars)}</span>
            </span>
            {r.description && <span className="alt-desc">{r.description.replace(/:[a-z0-9_+-]+:\s*/g, "")}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

// "More like ollama that run on macOS": the end of every manual, so there's always somewhere to go next.
function Related({ list, name, os }: { list: Alternative[]; name: string; os: OS }) {
  if (!list.length) return null;
  return (
    <section className="alts related" aria-labelledby="related-h">
      <h2 id="related-h">
        More like <span translate="no">{name}</span> that run on {OS_LABEL[os]}
      </h2>
      <AltCards list={list} os={os} />
    </section>
  );
}

function StartHere({
  meta,
  guides,
  os,
  way,
  steps,
  analysis: a,
  onGo,
}: {
  meta: Result["meta"];
  guides: Guides;
  os: OS;
  way: InstallWay | null;
  steps: number;
  analysis: Analysis;
  onGo: (id: string, mode?: Mode) => void;
}) {
  // Our steps are thin when we found little more than "clone it"; the project's own site is the better start then.
  // The maintainers' own guide or docs site beats our generated steps when there's no one-step install.
  const best = way ? "install" : guides.doc ? "guide" : guides.docs ? "docs" : guides.website && (steps <= 2 || /^https?:\/\/docs\./.test(guides.website)) ? "website" : "steps";
  const all: Door[] = [
    ...(way ? [{ id: "install", ...way, go: () => onGo("main-tabs", "install") }] : []),
    ...(guides.doc
      ? [{ id: "guide", tag: "Setup guide", title: `Read the maintainers' ${guides.doc.label.toLowerCase()}`, sub: guides.doc.path, go: () => onGo("maintainer-guide", "source") }]
      : []),
    { id: "steps", tag: "Steps", title: `Follow our ${steps} steps`, sub: `Copy-paste commands for ${OS_LABEL[os]}.`, go: () => onGo("our-steps", "source") },
    ...(guides.website ? [{ id: "website", tag: "Website ↗", title: host(guides.website), sub: "The project's own site.", href: guides.website }] : []),
    ...(guides.docs ? [{ id: "docs", tag: "Docs ↗", title: host(guides.docs), sub: "Linked from the README.", href: guides.docs }] : []),
    ...(guides.devcontainer
      ? [{ id: "codespaces", tag: "In the browser ↗", title: "Open in GitHub Codespaces", sub: "Nothing to install.", href: `https://codespaces.new/${meta.fullName}` }]
      : []),
  ];
  // One quick choice: the best start first, then up to two more, and the project's website always (as on the live
  // site); docs and Codespaces beyond that as plain links.
  const ordered = [...all.filter((d) => d.id === best), ...all.filter((d) => d.id !== best)];
  const doors = ordered.filter((d, i) => i < 3 || d.id === "website");
  const more = ordered.filter((d) => !doors.includes(d));
  // The one thing the doors can't show: what else has to be running or filled in before it works.
  const secrets = a.envVars.filter((e) => e.secret && !e.optional).length;
  const extras = [
    ...a.services.map((x) => x.name),
    ...(a.envVars.length ? [`${a.envVars.length} ${a.envVars.length === 1 ? "setting" : "settings"} in .env${secrets ? ` (${secrets} secret)` : ""}`] : []),
  ];
  // A single door ("Follow our steps") is no choice at all; the steps right below say the same.
  if (doors.length <= 1 && !extras.length) return null;
  return (
    <section className="start" aria-labelledby="start-h">
      <h2 id="start-h" className="start-h">
        Start here
      </h2>
      <div className="start-grid">
        {doors.map((d) => {
          const body = (
            <>
              <span className="door-tag">{d.tag}</span>
              <b translate={d.href ? "no" : undefined}>{d.title}</b>
              <span className="door-sub" translate={d.id === "guide" ? "no" : undefined}>
                {d.sub}
              </span>
            </>
          );
          const cls = `door${d.id === best ? " best" : ""}`;
          return d.href ? (
            <a key={d.id} className={cls} href={d.href} target="_blank" rel="noreferrer">
              {body}
            </a>
          ) : (
            <button key={d.id} className={cls} onClick={d.go}>
              {body}
            </button>
          );
        })}
      </div>
      {more.length > 0 && (
        <p className="start-more">
          Also:{" "}
          {more.map((d, i) => (
            <span key={d.id}>
              {i > 0 && " · "}
              {d.href ? (
                <a href={d.href} target="_blank" rel="noreferrer">
                  {d.tag.replace(" ↗", "")} ↗
                </a>
              ) : (
                <button className="link" onClick={d.go}>
                  {d.title}
                </button>
              )}
            </span>
          ))}
        </p>
      )}
      {extras.length > 0 && (
        <p className="start-heads">
          <span className="start-heads-tag">Heads-up</span>
          {way || guides.doc ? "Building it yourself? It also needs " : "It also needs "}
          {extras.map((x, i) => (
            <span key={x}>
              {i > 0 && (i === extras.length - 1 ? " and " : ", ")}
              <b>{x}</b>
            </span>
          ))}
          .{" "}
          <button className="link" onClick={() => onGo("parts")}>
            See the parts
          </button>
        </p>
      )}
    </section>
  );
}

// The setup or launch script the maintainers ship, at the top of "Build from source", where it gets used.
function RepoScript({ meta, guides, os }: { meta: Result["meta"]; guides: Guides; os: OS }) {
  const scripts = guides.scripts.filter((s) => s.windows === (os === "windows")).concat(guides.scripts.filter((s) => s.windows !== (os === "windows")));
  if (!scripts.length) return null;
  return (
    <div className="start-script">
      <span className="door-tag">{/^(start|run|launch|webui)/i.test(scripts[0].path.split("/").pop()!) ? "Launch script in the repo" : "Setup script in the repo"}</span>
      <p className="note">
        The maintainers included <code>{scripts[0].path}</code>.{" "}
        {scripts[0].run ? "Run it from the cloned folder after " : "Open it to see how it's meant to be run: "}
        <a href={`${meta.htmlUrl}/blob/${meta.branch}/${scripts[0].path}`} target="_blank" rel="noreferrer">
          {scripts[0].run ? "reading it" : `${scripts[0].path} on GitHub`}
        </a>
        .
      </p>
      {scripts[0].run && <CodeBlock text={scripts[0].run} />}
      {scripts.length > 1 && <p className="note">Also: {scripts.slice(1).map((s) => s.path).join(", ")}</p>}
    </div>
  );
}

function DidItWork({ repo, os, votes, onVotes }: { repo: string; os: OS; votes: Votes; onVotes: (v: Votes) => void }) {
  const storeKey = `gitmanual-vote:${repo.toLowerCase()}`;
  const [voted, setVoted] = useState<string | null>(null);
  useEffect(() => setVoted(localStorage.getItem(storeKey)), [storeKey]);
  const here = votes.byOs[os];

  async function vote(worked: boolean) {
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, os, worked }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const v = worked ? "worked" : "stuck";
    localStorage.setItem(storeKey, v);
    setVoted(v);
    onVotes(data.votes);
  }

  return (
    <div className="panel vote">
      <div>
        <h3>{voted ? (voted === "worked" ? "Nice, it's running 🎉" : "Thanks, that helps others") : "Did you get it running?"}</h3>
        <p className="note">
          {here ? `On ${OS_LABEL[os]}: ${here.worked} got it running, ${here.stuck} got stuck.` : `No reports for ${OS_LABEL[os]} yet.`}
          {voted === "stuck" && " The guide below can help with the step that failed."}
        </p>
      </div>
      {!voted && (
        <div className="vote-btns">
          <button className="btn btn-sm vote-yes" onClick={() => vote(true)}>
            ✓ It works
          </button>
          <button className="btn btn-sm" onClick={() => vote(false)}>
            I got stuck
          </button>
        </div>
      )}
    </div>
  );
}

// For maintainers: a README badge that links newcomers to this manual.
function BadgeCard({ fullName }: { fullName: string }) {
  // The same address on the server and in the browser, so the Markdown never differs between the two.
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const markdown = `[![Setup manual](${site}/${fullName}/badge.svg)](${site}/${fullName})`;
  return (
    <div className="side-sub">
      <h4>Is this your repo?</h4>
      <p className="badge-note">Add a badge to your README so newcomers find these steps.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny SVG badge */}
      <img className="badge-preview" src={`/${fullName}/badge.svg`} alt="Setup manual badge" height={20} />
      <code className="badge-code">{markdown}</code>
      <CopyButton text={markdown} className="btn btn-sm" label="Copy the badge Markdown" />
    </div>
  );
}
