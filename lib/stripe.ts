import Stripe from "stripe";

// GitManual Pro, sold through Stripe Managed Payments: Stripe (as Link) is the seller, so it collects and files
// sales tax and VAT, sends receipts and handles disputes. Checkout is Stripe's hosted page; who has Pro is learned
// from Stripe's webhooks (app/api/stripe/webhook) and kept in the `subscriptions` table (lib/db.ts).
// Off unless PRO_ENABLED=on and STRIPE_SECRET_KEY is set. The product and its two prices are made once per Stripe
// account by `npm run stripe:setup`, and found again by their lookup keys, so no price ids live in settings.

export const PRO_ENABLED = () => process.env.PRO_ENABLED === "on" && Boolean(process.env.STRIPE_SECRET_KEY);

export const PLANS = { month: "gitmanual_pro_month", year: "gitmanual_pro_year" } as const;
export type Plan = keyof typeof PLANS;

// What `npm run stripe:setup` creates. Tax is added on top where it applies (Managed Payments' default).
export const PRODUCT = {
  name: "GitManual Pro",
  description: "Unlimited questions to GitManual AI Agent about any public repo, on gitmanual.com and in the browser extension.",
  taxCode: "txcd_10105001", // AI as a Service, cloud based, personal use: eligible for Managed Payments
  prices: { month: 899, year: 4800 }, // US cents
};

// What the webhook (app/api/stripe/webhook) listens for; pick the same events on the endpoint in Stripe.
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
] as const;

// Where Managed Payments customers manage their orders, if the billing portal can't open.
export const LINK_ORDERS = "https://app.link.com";

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}

export type PlanPrice = { id: string; amount: number; currency: string };

// The live prices, read from Stripe and kept for ten minutes per server process.
let cached: { at: number; prices: Record<Plan, PlanPrice> } | null = null;
export async function planPrices(): Promise<Record<Plan, PlanPrice> | null> {
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.prices;
  try {
    const { data } = await stripe().prices.list({ lookup_keys: Object.values(PLANS), active: true, limit: 10 });
    const find = (plan: Plan) => data.find((p) => p.lookup_key === PLANS[plan]);
    const month = find("month");
    const year = find("year");
    if (!month || !year) {
      console.error("gitmanual pro: prices not found in Stripe; run npm run stripe:setup");
      return null;
    }
    const as = (p: Stripe.Price): PlanPrice => ({ id: p.id, amount: p.unit_amount ?? 0, currency: p.currency });
    cached = { at: Date.now(), prices: { month: as(month), year: as(year) } };
    return cached.prices;
  } catch (e) {
    console.error("gitmanual pro:", e);
    return null;
  }
}

// What the site keeps about a subscription: enough to know whether someone has Pro, and until when.
export type SubscriptionRecord = {
  githubId: number;
  customer: string;
  subscription: string;
  status: string;
  plan: Plan | null;
  periodEnd: number; // ms
  cancelAtPeriodEnd: boolean;
};

export function toRecord(s: Stripe.Subscription, githubId: number): SubscriptionRecord {
  const item = s.items.data[0];
  const lookup = item?.price.lookup_key;
  const plan = (Object.keys(PLANS) as Plan[]).find((p) => PLANS[p] === lookup) ?? (item?.price.recurring?.interval === "year" ? "year" : item ? "month" : null);
  const periodEnd = Math.max(0, ...s.items.data.map((i) => i.current_period_end)) * 1000;
  return {
    githubId,
    customer: typeof s.customer === "string" ? s.customer : s.customer.id,
    subscription: s.id,
    status: s.status,
    plan,
    periodEnd,
    cancelAtPeriodEnd: s.cancel_at_period_end || Boolean(s.cancel_at),
  };
}

// Pro while the subscription is paid up. A failed renewal (past_due) keeps Pro for a few days while Stripe retries
// the card, so a card that's been replaced doesn't cut someone off mid-week.
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export function hasPro(r: Pick<SubscriptionRecord, "status" | "periodEnd"> | null, now = Date.now()): boolean {
  return Boolean(r && ["active", "trialing", "past_due"].includes(r.status) && r.periodEnd + GRACE_MS > now);
}
