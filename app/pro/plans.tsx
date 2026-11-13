"use client";

import { useEffect, useState, type ReactNode } from "react";
import { sitePath } from "@/lib/site";
import { OPEN_CONTACT } from "../ui";

// The plan cards on /pro. Prices come from Stripe (rendered on the server); who's signed in and whether they have
// Pro come from /api/pro, which also records a checkout the visitor has just come back from.

type Prices = { month: number; year: number; currency: string } | null;
type Plan = "month" | "year";
type Status = {
  enabled: boolean;
  login: string | null;
  pro: boolean;
  subscription: { status: string; plan: Plan | null; periodEnd: number; cancelAtPeriodEnd: boolean } | null;
  prices?: Prices; // live from Stripe, for when the saved page was made before the prices existed
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

// One line of a plan: an icon tile, a short point and a few words more.
const ICONS = {
  book: "M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H19v-3",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
  infinity: "M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15l3 3 3-3",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  heart: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  brand: "M12 2l9 4.5v11L12 22l-9-4.5v-11zM3 6.5l9 4.5 9-4.5M12 11v11",
  lock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4",
  noads: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4.93 4.93l14.14 14.14",
  folder: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
} as const;

function Feature({ icon, title, children }: { icon: keyof typeof ICONS; title: string; children: ReactNode }) {
  return (
    <li>
      <span className="pro-feat-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[icon]} />
        </svg>
      </span>
      <span>
        <strong>{title}</strong>
        <small>{children}</small>
      </span>
    </li>
  );
}

export function Plans({ prices: saved, free, contact }: { prices: Prices; free: number; contact: boolean }) {
  const [plan, setPlan] = useState<Plan>("month"); // monthly first: the smaller number to start from
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  // The page the person came from ("Get Pro" in chat or the PDF dialog): sign-in and checkout carry it, and once
  // they have Pro they're taken back there.
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    const from = sitePath(params.get("back"));
    setBack(from);
    if (session) setJustPaid(true);
    fetch(`/api/pro${session ? `?session_id=${encodeURIComponent(session)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Status) => setStatus(s))
      .catch(() => setStatus({ enabled: true, login: null, pro: false, subscription: null }))
      .finally(() => session && window.history.replaceState(null, "", from ? `/pro?back=${encodeURIComponent(from)}` : "/pro"));
  }, []);

  // Just paid and came from somewhere: back there after a moment, long enough to read "You're on Pro".
  useEffect(() => {
    if (!justPaid || !status?.pro || !back) return;
    const t = setTimeout(() => window.location.assign(back), 3500);
    return () => clearTimeout(t);
  }, [justPaid, status?.pro, back]);

  async function go(path: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string; signIn?: boolean };
      if (j.url) return void (window.location.href = j.url);
      if (j.signIn) return void (window.location.href = signIn);
      setError(j.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Couldn't reach gitmanual. Check your connection and try again.");
    }
    setBusy(false);
  }

  const here = back ? `/pro?back=${encodeURIComponent(back)}` : "/pro";
  const signIn = `/api/github/connect?signin=1&back=${encodeURIComponent(here)}`;
  // The page is saved for 10 minutes with the prices it was built with; if those were missing, the live ones from
  // /api/pro fill in, so the card never waits on the next rebuild.
  const prices = saved ?? status?.prices ?? null;
  const saving = prices ? Math.round((1 - prices.year / (prices.month * 12)) * 100) : 0;
  const sub = status?.subscription;

  return (
    <>
      {justPaid && status?.pro && (
        <p className="pro-thanks" role="status">
          You&apos;re on Pro. Thank you!{" "}
          {back ? (
            <>
              Taking you back to where you were…{" "}
              <a href={back}>Go now</a>
            </>
          ) : (
            "Open any manual and ask away."
          )}
        </p>
      )}
      {!justPaid && status?.pro && back && (
        <p className="pro-thanks" role="status">
          You already have Pro. <a href={back}>Back to where you were</a>
        </p>
      )}
      <div className="pro-plans">
        <section className="pro-card" aria-labelledby="plan-free">
          <h2 id="plan-free">Free</h2>
          <p className="pro-price">
            <strong>$0</strong>
          </p>
          <ul className="pro-feats">
            <Feature icon="book" title="Every setup manual">
              Steps, scripts and lists for any public repo
            </Feature>
            <Feature icon="chat" title={`${free} AI answers a day`}>
              And 1 new written guide, with GitHub sign-in
            </Feature>
            <Feature icon="plug" title="Extension, API and MCP">
              Use it from GitHub, your code or your AI agent
            </Feature>
          </ul>
          <p className="pro-foot">{status?.login && !status.pro ? "Your plan now" : "No card needed"}</p>
        </section>

        <section className="pro-card pro-card-pro" aria-labelledby="plan-pro">
          <span className="pro-badge">Pro</span>
          <h2 id="plan-pro">Pro</h2>
          {prices ? (
            <>
              <div className="pro-toggle" role="radiogroup" aria-label="Billing">
                {(["month", "year"] as Plan[]).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={plan === p} className={plan === p ? "on" : ""} onClick={() => setPlan(p)}>
                    {p === "month" ? "Monthly" : "Yearly"}
                    {p === "year" && saving > 0 && <small>save {saving}%</small>}
                  </button>
                ))}
              </div>
              <p className="pro-price">
                <strong>{money(prices[plan], prices.currency)}</strong> / {plan}
                {plan === "year" && <span> · {money(Math.round(prices.year / 12), prices.currency)} a month</span>}
              </p>
            </>
          ) : (
            <p className="pro-price">Prices are loading. Refresh in a moment.</p>
          )}
          <ul className="pro-feats pro-feats-pro">
            <Feature icon="infinity" title="Unlimited AI answers">
              On the site and in the extension, plus 20 written guides a day
            </Feature>
            <Feature icon="file" title="Download any manual">
              A designed PDF to print or share, or Markdown
            </Feature>
            <Feature icon="noads" title="No ads">
              Every page, on any browser you sign in on
            </Feature>
            <Feature icon="plug" title="20× the API and MCP limits">
              5,000 requests an hour with your API key, not 250
            </Feature>
            <Feature icon="sparkle" title="New Pro features first">
              As they arrive, at no extra cost
            </Feature>
            <Feature icon="heart" title="Keeps gitmanual free">
              Your plan pays for everyone else&apos;s manuals
            </Feature>
          </ul>

          {!status ? (
            <p className="pro-foot">Checking…</p>
          ) : status.pro && sub ? (
            <div className="pro-have">
              <p>
                <strong>You have Pro</strong> as @{status.login}.{" "}
                {sub.cancelAtPeriodEnd ? `It ends on ${date(sub.periodEnd)}.` : `Renews on ${date(sub.periodEnd)}.`}
                {sub.status === "past_due" && " Your last payment didn't go through; update your card to keep Pro."}
              </p>
              <button type="button" className="btn" disabled={busy} onClick={() => go("/api/pro/portal")}>
                Manage subscription
              </button>
            </div>
          ) : status.login ? (
            <button type="button" className="btn btn-go pro-btn" disabled={busy || !prices} onClick={() => go("/api/pro/checkout", { plan, back })}>
              {busy ? <span className="spinner" /> : `Get Pro ${plan === "year" ? "yearly" : "monthly"}`}
            </button>
          ) : (
            <a className="btn btn-go pro-btn" href={signIn}>
              Sign in with GitHub to get Pro
            </a>
          )}
          {error && (
            <p className="key-error" role="alert">
              {error}
            </p>
          )}
          {status && !status.pro && <p className="pro-foot">Cancel any time. Tax added at checkout where it applies.</p>}
        </section>

        <TeamCard contact={contact} />
      </div>
    </>
  );
}

// The Team plan isn't built yet: its card says what's planned and counts who'd want it (app/api/interest, "team"),
// once per browser, without asking for an email. The numbers are on /admin/chat.
const WAITLIST = "gitmanual-team-waitlist";

function TeamCard({ contact }: { contact: boolean }) {
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    try {
      setJoined(Boolean(localStorage.getItem(WAITLIST)));
    } catch {}
  }, []);
  const join = () => {
    setJoined(true);
    try {
      localStorage.setItem(WAITLIST, "1");
    } catch {}
    fetch("/api/interest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature: "team" }), keepalive: true }).catch(() => {});
  };
  return (
    <section className="pro-card pro-card-team" aria-labelledby="plan-team">
      <span className="pro-badge pro-badge-soon">Coming soon</span>
      <h2 id="plan-team">Team</h2>
      <p className="pro-price">For teams that onboard people onto the same repos.</p>
      <ul className="pro-feats">
        <Feature icon="users" title="Pro for every seat">
          One bill for the whole team
        </Feature>
        <Feature icon="brand" title="Your logo on the PDFs">
          Setup guides in your own style
        </Feature>
        <Feature icon="lock" title="Chat about private repos">
          Answers from your own code
        </Feature>
        <Feature icon="folder" title="Shared manuals">
          The repos your team uses, in one place
        </Feature>
      </ul>
      {joined ? (
        <p className="pro-joined" role="status">
          You&apos;re on the list. Thank you!
        </p>
      ) : (
        <button type="button" className="btn pro-btn" onClick={join}>
          Join the waitlist
        </button>
      )}
      <p className="pro-foot">
        No email needed: it tells us to build it.
        {contact && (
          <>
            {" "}
            Need it now?{" "}
            <button type="button" className="link" onClick={() => window.dispatchEvent(new Event(OPEN_CONTACT))}>
              Contact us
            </button>
          </>
        )}
      </p>
    </section>
  );
}
