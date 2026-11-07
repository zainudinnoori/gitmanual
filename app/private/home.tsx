"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MyRepo } from "../api/github/me/route";
import { disconnect, HowPrivateWorks } from "../private";

type Me = { login: string | null; repos: MyRepo[] };

// The Private repos page: connect GitHub once, then open any repo you gave access to. Pasting a token is offered
// on the repo's own page (app/private.tsx), where the token link can be filled in for that owner.
export function PrivateHome({ appAvailable }: { appAvailable: boolean }) {
  const [me, setMe] = useState<Me | null>(null); // null while checking
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/github/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Me) => setMe(d))
      .catch(() => setMe({ login: null, repos: [] }));
  }, []);

  const shown = me?.repos.filter((r) => r.fullName.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];

  return (
    <div className="wrap report-state private">
      <p className="eyebrow">Private repos</p>
      <h1 className="display-md">Setup manuals for your private repos</h1>
      <p className="lead">
        Give read-only access and get the same step-by-step manual, just for you.
      </p>

      {me?.login ? (
        <section className="panel my-repos" aria-labelledby="my-repos-h">
          <div className="my-repos-head">
            <div>
              <h2 id="my-repos-h">Your repos</h2>
              <p className="note">
                Connected as <b>@{me.login}</b>. These are the repos you let gitmanual read.
              </p>
            </div>
            <div className="private-actions">
              <a className="btn btn-sm" href="/api/github/connect?back=/private">
                Add or remove repos
              </a>
              <button
                className="link"
                onClick={async () => {
                  await disconnect();
                  setMe({ login: null, repos: [] });
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
          {me.repos.length > 8 && (
            <input
              className="my-repos-filter"
              type="search"
              placeholder="Filter repos…"
              aria-label="Filter repos"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          {me.repos.length === 0 ? (
            <p className="empty">No repos yet: choose some with &ldquo;Add or remove repos&rdquo;.</p>
          ) : (
            <ul className="my-repos-list">
              {shown.map((r) => (
                <li key={r.fullName}>
                  <div>
                    <b translate="no">{r.fullName}</b>
                    {!r.private && <span className="chip ghost">public</span>}
                    {r.description && <span className="my-repo-desc">{r.description}</span>}
                  </div>
                  <Link className="btn btn-go btn-sm" href={`/${r.fullName}`}>
                    Get the manual
                  </Link>
                </li>
              ))}
              {shown.length === 0 && <li className="empty">No repo matches &ldquo;{filter}&rdquo;.</li>}
            </ul>
          )}
        </section>
      ) : (
        <AccessPass appAvailable={appAvailable} checking={me === null} />
      )}

      <HowPrivateWorks />
    </div>
  );
}

// Before connecting: the button, with what the access allows said right next to it.
function AccessPass({ appAvailable, checking }: { appAvailable: boolean; checking: boolean }) {
  return (
    <section className="pass" aria-labelledby="pass-h">
      <p className="pass-label">Read-only access</p>
      <h2 id="pass-h">Connect GitHub to see your repos here</h2>
      <ul className="pass-rules">
        <li className="pass-yes">Only the repos you pick</li>
        <li className="pass-no">No changes to your code</li>
        <li className="pass-no">Nothing saved</li>
      </ul>
      {!appAvailable ? (
        <p className="pass-alt">Open your private repo with the search box above, then paste a read-only GitHub token on its page.</p>
      ) : (
        <div className="pass-actions">
          <a className="btn btn-go pass-btn" href="/api/github/connect?back=/private" aria-disabled={checking || undefined}>
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d={GITHUB_MARK} />
            </svg>
            {checking ? "Checking…" : "Connect GitHub"}
          </a>
          <p className="pass-alt">or open a repo above and use a token</p>
        </div>
      )}
    </section>
  );
}

const GITHUB_MARK =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z";
