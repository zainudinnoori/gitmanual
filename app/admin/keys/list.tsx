"use client";

import { useEffect, useState } from "react";
import type { ApiKey } from "@/lib/db";

const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never");

export function KeysAdmin() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [denied, setDenied] = useState(false);

  const load = () =>
    fetch("/api/admin/keys", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) return setDenied(true);
      setKeys((await r.json()).keys);
    });
  useEffect(() => {
    load();
  }, []);

  async function toggle(k: ApiKey) {
    await fetch("/api/admin/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ githubId: k.githubId, blocked: !k.blocked }) });
    await load();
  }

  if (denied)
    return (
      <p>
        Admins only. <a href="/api/github/connect?signin=1&back=/admin/keys">Sign in with GitHub</a> with an account listed in{" "}
        <code>ADMIN_GITHUB_LOGINS</code>.
      </p>
    );
  if (!keys) return <p>Loading…</p>;
  if (!keys.length) return <p>No API keys yet.</p>;

  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            <th scope="col">Owner</th>
            <th scope="col">Key</th>
            <th scope="col">Made</th>
            <th scope="col">Last used</th>
            <th scope="col">Requests</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.githubId}>
              <th scope="row">
                <a href={`https://github.com/${k.login}`} target="_blank" rel="noreferrer">
                  @{k.login}
                </a>
              </th>
              <td>
                <code>{k.prefix}…</code>
              </td>
              <td>{date(k.createdAt)}</td>
              <td>{date(k.lastUsed)}</td>
              <td className="num">{k.uses.toLocaleString()}</td>
              <td>
                <button className={k.blocked ? "btn btn-sm" : "link"} onClick={() => toggle(k)}>
                  {k.blocked ? "Turn back on" : "Turn off"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
