import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { syncSubscription } from "@/lib/pro";
import { PRO_ENABLED, stripe, WEBHOOK_EVENTS as EVENTS } from "@/lib/stripe";

// Stripe tells the site when a subscription starts, renews, changes or ends; that's what turns Pro on and off.
// Every event is checked against STRIPE_WEBHOOK_SECRET, and the subscription is then read fresh from Stripe.
// Set the endpoint in Stripe (Developers → Webhooks) to https://<site>/api/stripe/webhook with WEBHOOK_EVENTS (lib/stripe.ts).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!PRO_ENABLED() || !secret) return NextResponse.json({ error: "Not configured." }, { status: 404 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const githubId = Number(s.client_reference_id);
      if (s.mode === "subscription" && s.subscription && Number.isSafeInteger(githubId) && githubId > 0)
        await syncSubscription(typeof s.subscription === "string" ? s.subscription : s.subscription.id, githubId);
    } else if ((EVENTS as readonly string[]).includes(event.type) && event.type.startsWith("customer.subscription.")) {
      await syncSubscription((event.data.object as Stripe.Subscription).id);
    }
  } catch (e) {
    // A 500 makes Stripe send the event again later.
    console.error("gitmanual stripe webhook:", e);
    return NextResponse.json({ error: "Couldn't record it." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
