"use client";

import { useEffect, useState } from "react";
import type { UserRow } from "@/lib/db";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/admin/users", { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(r.status === 403 ? "denied" : (j.error ?? "Couldn't load the users."));
      setUsers(j.users);
    });
  }, []);

  if (error === "denied")
    return (
      <p>
        Admins only. <a href="/api/github/connect?signin=1&back=/admin/users">Sign in with GitHub</a> with an account listed in{" "}
        <code>ADMIN_GITHUB_LOGINS</code>.
      </p>
    );
  if (error) return <p>{error}</p>;
  if (!users) return <p>Loading…</p>;
  if (!users.length) return <p>Nobody has signed in yet.</p>;

  const now = Date.now();
  const newThisWeek = users.filter((u) => now - u.firstSeen < WEEK).length;
  const activeThisWeek = users.filter((u) => now - u.lastSeen < WEEK).length;
  const q = filter.trim().toLowerCase();
  const shown = q ? users.filter((u) => u.login.toLowerCase().includes(q) || u.repos.some((r) => r.includes(q))) : users;

  return (
    <>
      <p>
        <strong>{users.length.toLocaleString()}</strong> {users.length === 1 ? "user" : "users"}: {newThisWeek} new and {activeThisWeek} active in
        the last 7 days. Answers and repos are from the last 14 days. <a href="/admin/chat">Chat stats</a> ·{" "}
        <a href="/admin/keys">API keys</a>
      </p>
      <p>
        <input
          type="search"
          className="my-repos-filter"
          placeholder="Filter by username or repo"
          aria-label="Filter users"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </p>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">First seen</th>
              <th scope="col">Last seen</th>
              <th scope="col">Sign-ins</th>
              <th scope="col">Answers</th>
              <th scope="col">Repos asked about</th>
              <th scope="col">API key</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.githubId}>
                <th scope="row">
                  <a href={`https://github.com/${u.login}`} target="_blank" rel="noreferrer">
                    @{u.login}
                  </a>
                </th>
                <td>{date(u.firstSeen)}</td>
                <td>{date(u.lastSeen)}</td>
                <td className="num">{u.signIns || "–"}</td>
                <td className="num">{u.answers || "–"}</td>
                <td>
                  {u.repos.length
                    ? u.repos.map((r, i) => (
                        <span key={r}>
                          {i > 0 && ", "}
                          <a href={`/${r}`}>{r}</a>
                        </span>
                      ))
                    : "–"}
                </td>
                <td>{u.apiKey ? "Yes" : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
