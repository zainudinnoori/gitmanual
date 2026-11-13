"use client";

import { useEffect, useState } from "react";
import type { ChatStats } from "@/lib/budget";
import type { InterestStats } from "@/lib/db";

type Stats = ChatStats & { logins: Record<string, string | null>; pdfInterest: InterestStats; downloads: { md: number; pdf: number }; teamWaitlist: number };

const usd = (n: number, digits = 2) => `$${n.toFixed(digits)}`;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

export function ChatAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/chat", { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(r.status === 403 ? "denied" : (j.error ?? "Couldn't load the stats."));
      setStats(j);
    });
  }, []);

  if (error === "denied")
    return (
      <p>
        Admins only. <a href="/api/github/connect?signin=1&back=/admin/chat">Sign in with GitHub</a> with an account listed in{" "}
        <code>ADMIN_GITHUB_LOGINS</code>.
      </p>
    );
  if (error) return <p>{error}</p>;
  if (!stats) return <p>Loading…</p>;

  const today = stats.days[0];
  const total = stats.days.reduce((s, d) => ({ answers: s.answers + d.answers, spent: s.spent + d.spent }), { answers: 0, spent: 0 });
  const { answersPerDay, dailyUsd } = stats.limits;

  return (
    <>
      <p>
        Last 14 days: <strong>{total.answers.toLocaleString()}</strong> answers, <strong>{usd(total.spent)}</strong> spent. Limits:{" "}
        {answersPerDay} answers a day per person, {usd(dailyUsd)} a day for the site. Days are UTC. <a href="/admin/users">Users</a> ·{" "}
        <a href="/admin/keys">API keys</a>
      </p>
      <p>
        Open now: <strong>{stats.live.chats}</strong> {stats.live.chats === 1 ? "chat" : "chats"}
        {stats.live.repos.length > 0 && <> ({stats.live.repos.map((r) => `${r.repo}${r.chats > 1 ? ` ×${r.chats}` : ""}`).join(", ")})</>}. Today:{" "}
        {today && today.day === new Date().toISOString().slice(0, 10) ? `${usd(today.spent)} of ${usd(dailyUsd)}` : "nothing yet"}.
      </p>

      <h2>Demand: PDF manual</h2>
      <p>
        Downloads in the last 30 days (each visitor once per repo a day): <strong>{stats.downloads.md.toLocaleString()}</strong> Markdown,{" "}
        <strong>{stats.downloads.pdf.toLocaleString()}</strong> PDF (Pro). Team plan waitlist:{" "}
        <strong>{stats.teamWaitlist.toLocaleString()}</strong> (each visitor once a day).
      </p>
      <p>
        Presses of &ldquo;PDF&rdquo; by people without Pro (it says &ldquo;coming soon&rdquo; while Pro is off, and leads to /pro once it&apos;s
        on); each visitor counts once per repo a day. Last 30 days: <strong>{stats.pdfInterest.total.toLocaleString()}</strong>
        {stats.pdfInterest.days.length > 0 && <> ({stats.pdfInterest.days.slice(0, 7).map((d) => `${day(d.day)}: ${d.clicks}`).join(", ")})</>}.
        {stats.pdfInterest.repos.length > 0 && (
          <>
            {" "}
            Top repos:{" "}
            {stats.pdfInterest.repos.map((r, i) => (
              <span key={r.repo}>
                {i > 0 && ", "}
                <a href={`/${r.repo}`}>{r.repo}</a> ({r.clicks})
              </span>
            ))}
            .
          </>
        )}
      </p>

      <h2>By day</h2>
      {stats.days.length ? (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Answers</th>
                <th scope="col">People</th>
                <th scope="col">Spent</th>
                <th scope="col">Per answer</th>
                <th scope="col">Hit the limit</th>
              </tr>
            </thead>
            <tbody>
              {stats.days.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{day(d.day)}</th>
                  <td className="num">{d.answers.toLocaleString()}</td>
                  <td className="num">{d.people.toLocaleString()}</td>
                  <td className="num">
                    {usd(d.spent)}
                    {d.spent >= dailyUsd * 0.8 && " ⚠"}
                  </td>
                  <td className="num">{d.avg === null ? "–" : usd(d.avg, 4)}</td>
                  <td className="num">{d.atLimit || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No answers yet.</p>
      )}

      <h2>Top repos</h2>
      {stats.topRepos.length ? (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th scope="col">Repo</th>
                <th scope="col">Answers</th>
                <th scope="col">People</th>
              </tr>
            </thead>
            <tbody>
              {stats.topRepos.map((r) => (
                <tr key={r.repo}>
                  <th scope="row">
                    <a href={`/${r.repo}`}>{r.repo}</a>
                  </th>
                  <td className="num">{r.answers.toLocaleString()}</td>
                  <td className="num">{r.people.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No repos yet. Many questions on one repo usually means its manual leaves people stuck.</p>
      )}

      <h2>Used all {answersPerDay} answers</h2>
      {stats.atLimit.length ? (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Person</th>
                <th scope="col">Answers</th>
              </tr>
            </thead>
            <tbody>
              {stats.atLimit.map((a) => {
                const name = stats.logins[a.account];
                return (
                  <tr key={`${a.day}-${a.account}`}>
                    <th scope="row">{day(a.day)}</th>
                    <td>
                      {name ? (
                        <a href={`https://github.com/${name}`} target="_blank" rel="noreferrer">
                          @{name}
                        </a>
                      ) : (
                        <code>id {a.account}</code>
                      )}
                    </td>
                    <td className="num">{a.answers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nobody yet. This is the number to watch before adding a paid plan.</p>
      )}
    </>
  );
}
