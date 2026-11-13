import { NextResponse } from "next/server";
import { proFor } from "@/lib/pro";
import { SITE_URL, sitePath } from "@/lib/site";
import { planPrices, PLANS, PRO_ENABLED, stripe, type Plan } from "@/lib/stripe";
import { viewer } from "@/lib/viewer";

// "Get Pro": a Stripe Checkout page (Managed Payments, so Stripe is the seller and handles tax) for the signed-in
// GitHub account. The account id goes on the session and the subscription, which is how the webhook knows whose it is.
//   POST /api/pro/checkout {"plan": "month" | "year"} → {"url": "https://checkout.stripe.com/..."}
export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers });
  if (!PRO_ENABLED()) return fail("Pro isn't available on this site.", 404);

  const body = (await req.json().catch(() => ({}))) as { plan?: string; back?: string };
  const back = sitePath(body.back);
  const plan = body.plan as Plan;
  if (!(plan in PLANS)) return fail("Expected plan: month or year.", 400);

  const { user, settle } = await viewer();
  if (!user) return fail("Sign in with GitHub first.", 401, { signIn: true });
  const { pro, subscription } = await proFor(user.id);
  if (pro) return settle(fail("You already have Pro.", 409, { pro: true }));

  const prices = await planPrices();
  if (!prices) return fail("Checkout is unavailable right now. Try again later.", 503);

  try {
    const meta = { github_id: String(user.id), github_login: user.login };
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      managed_payments: { enabled: true },
      line_items: [{ price: prices[plan].id, quantity: 1 }],
      client_reference_id: String(user.id),
      ...(subscription?.customer && { customer: subscription.customer }),
      metadata: meta,
      subscription_data: { metadata: meta },
      // Back on /pro to see it worked, then on to the page they came from.
      success_url: `${SITE_URL}/pro?session_id={CHECKOUT_SESSION_ID}${back ? `&back=${encodeURIComponent(back)}` : ""}`,
      cancel_url: `${SITE_URL}/pro${back ? `?back=${encodeURIComponent(back)}` : ""}`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return settle(NextResponse.json({ url: session.url }, { headers }));
  } catch (e) {
    console.error("gitmanual pro checkout:", e);
    return fail("Checkout is unavailable right now. Try again later.", 502);
  }
}
