import { NextResponse } from "next/server";
import { proFor } from "@/lib/pro";
import { SITE_URL } from "@/lib/site";
import { LINK_ORDERS, PRO_ENABLED, stripe } from "@/lib/stripe";
import { viewer } from "@/lib/viewer";

// "Manage subscription": Stripe's billing portal for the signed-in account's customer (change plan, card, cancel).
// If the portal can't open, Link (Stripe's seller name for Managed Payments) manages the same subscription.
export async function POST() {
  const headers = { "Cache-Control": "private, no-store" };
  if (!PRO_ENABLED()) return NextResponse.json({ error: "Pro isn't available on this site." }, { status: 404, headers });
  const { user, settle } = await viewer();
  if (!user) return NextResponse.json({ error: "Sign in with GitHub first.", signIn: true }, { status: 401, headers });
  const { subscription } = await proFor(user.id);
  if (!subscription) return settle(NextResponse.json({ error: "There's no subscription on this account." }, { status: 404, headers }));
  try {
    const portal = await stripe().billingPortal.sessions.create({ customer: subscription.customer, return_url: `${SITE_URL}/pro` });
    return settle(NextResponse.json({ url: portal.url }, { headers }));
  } catch (e) {
    console.error("gitmanual pro portal:", e);
    return settle(NextResponse.json({ url: LINK_ORDERS }, { headers }));
  }
}
