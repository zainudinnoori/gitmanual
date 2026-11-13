import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import Stripe from "stripe";

// GitManual Pro: the webhook, checkout and the Pro chat pool, against the real routes and database (a throwaway
// SQLite file). Stripe's API is a stand-in; webhook signatures are made and checked with the real Stripe library.

process.env.GITMANUAL_DB = join(mkdtempSync(join(tmpdir(), "gitmanual-pro-")), "test.db");
delete process.env.TURSO_DATABASE_URL;
process.env.PRO_ENABLED = "on";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.CHAT_ENABLED = "on";
process.env.ANTHROPIC_API_KEY = "test";

const lib = (path: string) => new URL(`../lib/${path}`, import.meta.url).href;
const DAY = 24 * 60 * 60 * 1000;

let signedIn: { id: number; login: string } | null = { id: 7, login: "pat" };
mock.module(lib("viewer.ts"), {
  exports: { viewer: async () => ({ user: signedIn && { ...signedIn, token: "t" }, settle: (r: unknown) => r }), isAdmin: () => false },
});

// Stripe's side: subscriptions by id, checkout sessions by id, and what checkout was asked to create.
const subs = new Map<string, any>();
const sessions = new Map<string, any>();
const created: any[] = [];
const real = new Stripe("sk_test_fake");
const fake = {
  webhooks: real.webhooks,
  subscriptions: { retrieve: async (id: string) => structuredClone(subs.get(id)) },
  checkout: {
    sessions: {
      create: async (p: any) => (created.push(p), { id: "cs_new", url: "https://checkout.stripe.com/c/pay/cs_new" }),
      retrieve: async (id: string) => sessions.get(id),
    },
  },
  billingPortal: { sessions: { create: async () => ({ url: "https://billing.stripe.com/p/session/x" }) } },
};
const stripeLib = await import("../lib/stripe");
const prices = { month: { id: "price_m", amount: 600, currency: "usd" }, year: { id: "price_y", amount: 4800, currency: "usd" } };
mock.module(lib("stripe.ts"), { exports: { ...stripeLib, stripe: () => fake, planPrices: async () => prices } });

const { hasPro, toRecord } = await import("../lib/stripe");
const { proFor } = await import("../lib/pro");
const { saveSubscription, subscriptionFor } = await import("../lib/db");
const { POOLS, reserve, settle } = await import("../lib/budget");
const webhook = await import("../app/api/stripe/webhook/route");
const checkout = await import("../app/api/pro/checkout/route");
const proRoute = await import("../app/api/pro/route");
const chat = await import("../app/api/chat/route");

const subscription = (id: string, githubId: number | null, over: Record<string, unknown> = {}) => ({
  id,
  object: "subscription",
  customer: `cus_${githubId}`,
  status: "active",
  cancel_at_period_end: false,
  cancel_at: null,
  metadata: githubId ? { github_id: String(githubId) } : {},
  items: {
    data: [
      { current_period_end: Math.floor((Date.now() + 30 * DAY) / 1000), price: { lookup_key: "gitmanual_pro_month", recurring: { interval: "month" } } },
    ],
  },
  ...over,
});

function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = real.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } });
}
const event = (type: string, object: object) => ({ id: `evt_${Math.random()}`, object: "event", type, data: { object } });

test("Pro while paid up, for a few days after a failed renewal, and not once ended", () => {
  const now = Date.now();
  assert.equal(hasPro({ status: "active", periodEnd: now + DAY }, now), true);
  assert.equal(hasPro({ status: "past_due", periodEnd: now - DAY }, now), true);
  assert.equal(hasPro({ status: "past_due", periodEnd: now - 4 * DAY }, now), false);
  assert.equal(hasPro({ status: "canceled", periodEnd: now + DAY }, now), false);
  assert.equal(hasPro({ status: "incomplete", periodEnd: now + DAY }, now), false);
  assert.equal(hasPro(null, now), false);
});

test("a Stripe subscription becomes a record with its plan and paid-up date", () => {
  const r = toRecord(subscription("sub_a", 1, { cancel_at_period_end: true }) as any, 1);
  assert.equal(r.plan, "month");
  assert.equal(r.customer, "cus_1");
  assert.equal(r.cancelAtPeriodEnd, true);
  assert.ok(r.periodEnd > Date.now() + 29 * DAY);
});

test("webhook: a bad signature is refused and nothing is recorded", async () => {
  const res = await webhook.POST(
    new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=bad" } }),
  );
  assert.equal(res.status, 400);
});

test("webhook: checkout turns Pro on for the GitHub account that paid, and cancelling turns it off", async () => {
  subs.set("sub_7", subscription("sub_7", 7));
  let res = await webhook.POST(
    signed(event("checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "subscription", client_reference_id: "7", subscription: "sub_7" })),
  );
  assert.equal(res.status, 200);
  assert.equal((await proFor(7)).pro, true);

  // Events carry an old copy; the site reads the subscription fresh, so the current state wins.
  subs.set("sub_7", subscription("sub_7", 7, { status: "canceled" }));
  res = await webhook.POST(signed(event("customer.subscription.deleted", subscription("sub_7", 7))));
  assert.equal(res.status, 200);
  assert.equal((await proFor(7)).pro, false);
  assert.equal((await subscriptionFor(7))?.status, "canceled");
});

test("webhook: a subscription without a GitHub id is matched by its id, or ignored", async () => {
  subs.set("sub_8", subscription("sub_8", 8));
  await webhook.POST(signed(event("customer.subscription.created", subscription("sub_8", 8))));
  subs.set("sub_8", subscription("sub_8", null, { cancel_at_period_end: true, customer: "cus_8" }));
  await webhook.POST(signed(event("customer.subscription.updated", { id: "sub_8" })));
  assert.equal((await subscriptionFor(8))?.cancelAtPeriodEnd, true);

  subs.set("sub_x", subscription("sub_x", null));
  const res = await webhook.POST(signed(event("customer.subscription.updated", { id: "sub_x" })));
  assert.equal(res.status, 200);
});

test("an old, ended subscription never overwrites a newer running one", async () => {
  const now = Date.now();
  const base = { githubId: 9, customer: "cus_9", plan: "month" as const, periodEnd: now + DAY, cancelAtPeriodEnd: false };
  await saveSubscription({ ...base, subscription: "sub_new", status: "active" });
  await saveSubscription({ ...base, subscription: "sub_old", status: "canceled" });
  assert.equal((await subscriptionFor(9))?.subscription, "sub_new");
  await saveSubscription({ ...base, subscription: "sub_new", status: "canceled" });
  await saveSubscription({ ...base, subscription: "sub_newer", status: "active" });
  assert.equal((await subscriptionFor(9))?.subscription, "sub_newer");
});

test("checkout: sign-in first; then a Managed Payments session tied to the GitHub account", async () => {
  const post = (plan: string) => checkout.POST(new Request("http://localhost/api/pro/checkout", { method: "POST", body: JSON.stringify({ plan }) }));
  signedIn = null;
  assert.equal((await post("month")).status, 401);
  signedIn = { id: 7, login: "pat" };
  assert.equal((await post("week")).status, 400);

  const res = await post("year");
  assert.equal(res.status, 200);
  assert.match((await res.json()).url, /^https:\/\/checkout\.stripe\.com\//);
  const p = created.at(-1);
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.managed_payments, { enabled: true });
  assert.equal(p.line_items[0].price, "price_y");
  assert.equal(p.client_reference_id, "7");
  assert.equal(p.subscription_data.metadata.github_id, "7");
  assert.equal(p.customer, "cus_7"); // they subscribed before: the same Stripe customer
});

test("checkout: back on /pro after paying, then on to the page they came from (same site only)", async () => {
  signedIn = { id: 40, login: "lou" };
  const post = (back: string) =>
    checkout.POST(new Request("http://localhost/api/pro/checkout", { method: "POST", body: JSON.stringify({ plan: "month", back }) }));
  await post("/ollama/ollama/macos#pdf");
  assert.match(created.at(-1).success_url, /\/pro\?session_id=\{CHECKOUT_SESSION_ID\}&back=%2Follama%2Follama%2Fmacos%23pdf$/);
  assert.match(created.at(-1).cancel_url, /\/pro\?back=%2Follama%2Follama%2Fmacos%23pdf$/);
  for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil"]) {
    await post(bad);
    assert.match(created.at(-1).success_url, /\/pro\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  }
  const { proUrl } = await import("../lib/site");
  assert.equal(proUrl("/a/b#ask"), "/pro?back=%2Fa%2Fb%23ask");
  assert.equal(proUrl("https://evil.example"), "/pro");
});

test("checkout: someone who already has Pro isn't sold it twice", async () => {
  signedIn = { id: 9, login: "sam" };
  const res = await checkout.POST(new Request("http://localhost/api/pro/checkout", { method: "POST", body: JSON.stringify({ plan: "month" }) }));
  assert.equal(res.status, 409);
});

test("back from checkout: only the account that paid gets Pro from the session", async () => {
  subs.set("sub_20", subscription("sub_20", 20));
  sessions.set("cs_20", { id: "cs_20", mode: "subscription", client_reference_id: "20", subscription: "sub_20" });
  signedIn = { id: 21, login: "eve" };
  let j = await (await proRoute.GET(new Request("http://localhost/api/pro?session_id=cs_20"))).json();
  assert.equal(j.pro, false);
  assert.equal(await subscriptionFor(20), null);
  signedIn = { id: 20, login: "kim" };
  j = await (await proRoute.GET(new Request("http://localhost/api/pro?session_id=cs_20"))).json();
  assert.equal(j.pro, true);
  assert.equal(j.prices.year, 4800);
});

test("no ads: /api/pro tells the browser while Pro lasts, and stops once it doesn't", async () => {
  const noAds = async (cookie?: string) => {
    const res = await proRoute.GET(new Request("http://localhost/api/pro", { headers: cookie ? { cookie } : {} }));
    return res.headers.getSetCookie().find((c) => c.startsWith("gm_noads=")) ?? null;
  };
  signedIn = { id: 20, login: "kim" }; // has Pro (above)
  assert.match((await noAds("gm_github=x"))!, /^gm_noads=1;/);
  signedIn = { id: 21, login: "eve" };
  assert.match((await noAds("gm_github=x"))!, /^gm_noads=;/);
  signedIn = null;
  assert.match((await noAds())!, /^gm_noads=;/); // signed out
  assert.equal(await noAds("gm_github=x"), null); // signed in but GitHub didn't answer: left as it was
});

test("chat: Pro answers come from the Pro pool; a free account at its limit is offered Pro", async () => {
  signedIn = { id: 20, login: "kim" };
  let j = await (await chat.GET()).json();
  assert.equal(j.pro, true);
  assert.equal(j.allowance.limit, 150);

  signedIn = { id: 30, login: "lee" };
  for (let i = 0; i < POOLS.user.answersPerDay; i++) {
    const r = await reserve({ pool: "user", account: "30", requestId: `req-free-${i}`, model: "claude-haiku-5-5" });
    await settle(r.key, "claude-haiku-5-5", [{ input_tokens: 1000, output_tokens: 100 }]);
  }
  j = await (await chat.GET()).json();
  assert.equal(j.pro, false);
  assert.equal(j.proOffer, true);
  assert.equal(j.allowance.limit - j.allowance.used, 0);
});
