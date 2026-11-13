import { NextResponse } from "next/server";
import { proFor, syncCheckout } from "@/lib/pro";
import { planPrices, PRO_ENABLED } from "@/lib/stripe";
import { viewer } from "@/lib/viewer";

// For /pro: who's signed in, whether they have Pro and until when, and the prices.
// ?session_id= is the checkout Stripe just sent them back from; it's read once so Pro shows straight away.
export async function GET(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!PRO_ENABLED()) return NextResponse.json({ enabled: false }, { headers });
  const { user, settle } = await viewer();
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (user && sessionId && /^cs_[\w]+$/.test(sessionId)) await syncCheckout(sessionId, user.id).catch((e) => console.error("gitmanual pro:", e));
  const [{ pro, subscription }, prices] = await Promise.all([proFor(user?.id), planPrices()]);
  return settle(
    NextResponse.json(
      {
        enabled: true,
        login: user?.login ?? null,
        pro,
        subscription: subscription && {
          status: subscription.status,
          plan: subscription.plan,
          periodEnd: subscription.periodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        },
        prices: prices && { month: prices.month.amount, year: prices.year.amount, currency: prices.month.currency },
      },
      { headers },
    ),
  );
}
