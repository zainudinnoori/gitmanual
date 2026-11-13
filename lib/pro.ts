import type Stripe from "stripe";
import { githubIdForSubscription, saveSubscription, subscriptionFor, type SubscriptionRow } from "./db";
import { hasPro, PRO_ENABLED, stripe, toRecord } from "./stripe";

// The one check every Pro feature uses: does this GitHub account have GitManual Pro right now?
// Without the database it answers no, so a Pro feature is never given away by mistake (chat itself pauses then).
export async function proFor(githubId: number | null | undefined): Promise<{ pro: boolean; subscription: SubscriptionRow | null }> {
  if (!githubId || !PRO_ENABLED()) return { pro: false, subscription: null };
  try {
    const subscription = await subscriptionFor(githubId);
    return { pro: hasPro(subscription), subscription };
  } catch (e) {
    console.error("gitmanual pro:", e);
    return { pro: false, subscription: null };
  }
}

export const isPro = async (githubId: number | null | undefined) => (await proFor(githubId)).pro;

// Which GitHub account a subscription belongs to: set on it at checkout (app/api/pro/checkout), or already known here.
async function ownerOf(s: Stripe.Subscription): Promise<number | null> {
  const fromMeta = Number(s.metadata?.github_id);
  if (Number.isSafeInteger(fromMeta) && fromMeta > 0) return fromMeta;
  return githubIdForSubscription(s.id);
}

// Copies a subscription's current state from Stripe. Always re-read from Stripe rather than taken from the event,
// so events arriving late or out of order can't leave an old state behind.
export async function syncSubscription(id: string, githubId?: number): Promise<SubscriptionRow | null> {
  const s = await stripe().subscriptions.retrieve(id);
  const owner = githubId ?? (await ownerOf(s));
  if (!owner) {
    console.error(`gitmanual pro: subscription ${id} has no GitHub account`);
    return null;
  }
  const record = toRecord(s, owner);
  await saveSubscription(record);
  return record;
}

// Back from checkout: the page asks right away instead of waiting for the webhook. Only for the account that paid.
export async function syncCheckout(sessionId: string, githubId: number): Promise<SubscriptionRow | null> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== String(githubId) || session.mode !== "subscription" || !session.subscription) return null;
  const sub = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  return syncSubscription(sub, githubId);
}
