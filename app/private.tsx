"use client";

import { useEffect, useState } from "react";

// Private repos: shown in place of "not found". The visitor connects the gitmanual GitHub App or pastes a
// read-only token; either way the manual is built for them alone and nothing is saved (see app/api/private).

export const TOKEN_KEY = "gitmanual-github-token";

const savedToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

// The pasted token, if there is one, goes along with the request; otherwise the server uses the connected app.
export function fetchPrivate(url: string): Promise<Response> {
  const token = savedToken();
  return fetch("/api/private", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-GitHub-Token": token } : {}) },
    body: JSON.stringify({ url }),
    cache: "no-store",
  });
}

// Forgets both ways in: the token in this browser and the app sign-in cookie.
export async function disconnect() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  await fetch("/api/github/logout", { method: "POST" }).catch(() => {});
}

// GitHub's form for a fine-grained token, filled in: read-only code access, for this owner, for 30 days.
const tokenLink = (owner: string) =>
  `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams({
    name: "gitmanual",
    description: "Read-only access so gitmanual.com can build setup manuals for my private repos.",
    target_name: owner,
    expires_in: "30",
    contents: "read",
  })}`;

type Answer = { error?: string; connect?: boolean; app?: boolean; via?: "token" | "app" };

export function PrivateAccess<T>({
  owner,
  repo,
  gitRef,
  appAvailable,
  onLoaded,
}: {
  owner: string;
  repo: string;
  gitRef?: string;
  // The GitHub App is set up on this site (lib/session.ts); without it, only the token option shows.
  appAvailable: boolean;
  onLoaded: (result: T) => void;
}) {
  const url = `${owner}/${repo}${gitRef ? `/tree/${gitRef}` : ""}`;
  const [state, setState] = useState<"checking" | "ask" | "loading">("checking");
  const [problem, setProblem] = useState<Answer | null>(null);
  const [token, setToken] = useState("");
  const [back, setBack] = useState(`/${owner}/${repo}`);

  async function attempt() {
    const res = await fetchPrivate(url);
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    if (res.ok) return onLoaded(data as T);
    // A token GitHub turned down isn't tried again on the next visit.
    if (data.via === "token") {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
    }
    // Nothing to try with yet: just the options, no error.
    setProblem(res.status === 401 && data.connect && !data.via ? null : data);
    setState("ask");
  }

  // Someone who connected before (or saved a token) goes straight to their manual.
  useEffect(() => {
    setBack(window.location.pathname + window.location.search);
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  async function submitToken(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    try {
      localStorage.setItem(TOKEN_KEY, token.trim());
    } catch {}
    setState("loading");
    await attempt();
  }

  if (state === "checking") {
    return (
      <div className="wrap report-state" aria-busy="true">
        <p className="eyebrow" translate="no">
          {owner}/{repo}
        </p>
        <h1 className="display-md">Looking for {repo}…</h1>
      </div>
    );
  }

  const connect = `/api/github/connect?back=${encodeURIComponent(back)}`;
  return (
    <div className="wrap report-state private">
      <p className="eyebrow">Missing parts</p>
      <h1 className="display-md">
        We couldn&apos;t open {owner}/{repo}
      </h1>
      <p className="lead">
        It doesn&apos;t exist, or it&apos;s private. If it&apos;s yours (or your team&apos;s), give gitmanual read-only access and it builds the
        manual just for you.
      </p>

      {problem?.error && (
        <p className="private-problem" role="alert">
          {problem.error}
          {problem.via === "app" && (
            <>
              {" "}
              <a href={connect}>Choose repos on GitHub</a>
            </>
          )}
          {problem.via === "token" && " Check the token, or make a new one below."}
        </p>
      )}

      <div className="private-ways">
        {appAvailable && (
          <section className="panel private-way">
            <h2>Connect GitHub</h2>
            <p className="note">On GitHub, pick the repos gitmanual may read. You can add or remove repos there any time.</p>
            <a className="btn btn-go btn-sm" href={connect}>
              Connect GitHub
            </a>
          </section>
        )}
        <section className="panel private-way">
          <h2>{appAvailable ? "Or use a token" : "Use a token"}</h2>
          <ol className="private-steps">
            <li>
              <a href={tokenLink(owner)} target="_blank" rel="noreferrer">
                Create a token on GitHub ↗
              </a>{" "}
              (already filled in: read-only, 30 days).
            </li>
            <li>
              Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick {repo}.
            </li>
            <li>Generate it and paste it here.</li>
          </ol>
          <form className="private-token" onSubmit={submitToken}>
            <label className="sr-only" htmlFor="gh-token">
              GitHub token
            </label>
            <input
              id="gh-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="github_pat_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="btn btn-go btn-sm" disabled={state === "loading" || !token.trim()}>
              {state === "loading" ? "Opening…" : "Get the manual"}
            </button>
          </form>
        </section>
      </div>

      <HowPrivateWorks />
    </div>
  );
}

// What happens with a private repo, said the same way wherever access is asked for.
export function HowPrivateWorks({ open = true }: { open?: boolean }) {
  return (
    <details className="private-how" open={open}>
      <summary>How this works</summary>
      <ul>
        <li>
          <b>Read-only.</b> gitmanual can read the repos you choose and nothing else. It can&apos;t change code, open issues or see other
          repos.
        </li>
        <li>
          <b>Nothing is kept.</b> The key files are read once to build your manual, then thrown away. Private manuals aren&apos;t saved,
          listed, shared or shown to search engines.
        </li>
        <li>
          <b>Your access stays with you.</b> A token stays in this browser; a GitHub connection is kept in an encrypted cookie. Neither is
          stored on our servers.
        </li>
        <li>
          <b>Take it back any time.</b> &ldquo;Disconnect&rdquo; on the manual forgets it here; on GitHub, delete the token or remove the
          app under{" "}
          <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer">
            Settings → Applications
          </a>
          .
        </li>
      </ul>
    </details>
  );
}
