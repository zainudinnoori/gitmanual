"use client";

import { useEffect, useState } from "react";
import { CodeBlock } from "../ui";

type KeyInfo = { prefix: string; createdAt: number; lastUsed: number | null; uses: number; blocked: boolean };
type State = { login: string | null; key: KeyInfo | null };

const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// The signed-in visitor's API key on /developers: sign in with GitHub, make a key (shown once), see its use,
// replace or delete it. Replacing and deleting ask once more on the button itself.
export function KeyPanel({ appAvailable }: { appAvailable: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"replace" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/keys", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: State) => setState(d))
      .catch(() => setState({ login: null, key: null }));
  useEffect(() => {
    load();
  }, []);

  async function act(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/keys", { method }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) setError(d.error ?? "Something went wrong. Try again.");
    else setFresh(method === "POST" ? d.key : null);
    setConfirm(null);
    await load();
    setBusy(false);
  }

  if (!appAvailable) return <p className="key-panel note">API keys aren&apos;t set up on this site yet. The API and MCP server work without one.</p>;
  if (!state) return <p className="key-panel note">Checking…</p>;

  if (!state.login)
    return (
      <div className="key-panel">
        <p>Sign in with GitHub to get a free key. gitmanual only learns your username; it gets no access to your repos.</p>
        <a className="btn btn-go key-btn" href="/api/github/connect?signin=1&back=/developers">
          Sign in with GitHub
        </a>
      </div>
    );

  const k = state.key;
  return (
    <div className="key-panel">
      <p className="key-who">
        Signed in as <b>@{state.login}</b>
      </p>
      {error && (
        <p className="key-error" role="alert">
          {error}
        </p>
      )}
      {fresh && (
        <div className="key-fresh">
          <p>
            <b>Your new key.</b> Copy it now: it won&apos;t be shown again.
          </p>
          <CodeBlock text={fresh} />
        </div>
      )}
      {k ? (
        <>
          <dl className="key-facts">
            <div>
              <dt>Key</dt>
              <dd>
                <code>{k.prefix}…</code>
              </dd>
            </div>
            <div>
              <dt>Made</dt>
              <dd>{date(k.createdAt)}</dd>
            </div>
            <div>
              <dt>Last used</dt>
              <dd>{k.lastUsed ? date(k.lastUsed) : "Not yet"}</dd>
            </div>
            <div>
              <dt>Requests</dt>
              <dd className="num">{k.uses.toLocaleString()}</dd>
            </div>
          </dl>
          {k.blocked ? (
            <p className="key-error">This key has been turned off. Get in touch through the contact page.</p>
          ) : (
            <div className="key-actions">
              {confirm === "replace" ? (
                <button className="btn btn-sm btn-go" disabled={busy} onClick={() => act("POST")}>
                  Yes, replace it (the old key stops working)
                </button>
              ) : (
                <button className="btn btn-sm" disabled={busy} onClick={() => setConfirm("replace")}>
                  Replace key
                </button>
              )}
              {confirm === "delete" ? (
                <button className="btn btn-sm" disabled={busy} onClick={() => act("DELETE")}>
                  Yes, delete it
                </button>
              ) : (
                <button className="link" disabled={busy} onClick={() => setConfirm("delete")}>
                  Delete key
                </button>
              )}
              {confirm && (
                <button className="link" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        !fresh && (
          <button className="btn btn-go key-btn" disabled={busy} onClick={() => act("POST")}>
            {busy ? "Making your key…" : "Create my API key"}
          </button>
        )
      )}
    </div>
  );
}
