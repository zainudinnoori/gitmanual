// Creates GitManual Pro in the Stripe account that STRIPE_SECRET_KEY belongs to: one product and a monthly and a
// yearly price, found by their lookup keys (lib/stripe.ts). Safe to run again: anything already there is kept.
// Run once in the sandbox and once with the live key:  npm run stripe:setup
import { PLANS, PRODUCT, stripe, type Plan } from "../lib/stripe";

async function main() {
  const s = stripe();
  const account = await s.accounts.retrieveCurrent();
  const live = process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_");
  console.log(`Stripe account: ${account.settings?.dashboard?.display_name ?? account.id} (${live ? "LIVE" : "test"})`);

  const existing = await s.prices.list({ lookup_keys: Object.values(PLANS), limit: 10, expand: ["data.product"] });
  let productId = (existing.data[0]?.product as { id?: string } | undefined)?.id;
  if (!productId) {
    const found = await s.products.search({ query: `name:'${PRODUCT.name}' AND active:'true'` }).catch(() => null);
    productId = found?.data[0]?.id;
  }
  if (!productId) {
    const p = await s.products.create({ name: PRODUCT.name, description: PRODUCT.description, tax_code: PRODUCT.taxCode });
    productId = p.id;
    console.log(`Created product ${p.id}`);
  } else {
    await s.products.update(productId, { description: PRODUCT.description, tax_code: PRODUCT.taxCode });
    console.log(`Product ${productId} already there`);
  }

  for (const plan of Object.keys(PLANS) as Plan[]) {
    const have = existing.data.find((p) => p.lookup_key === PLANS[plan]);
    if (have && have.unit_amount === PRODUCT.prices[plan]) {
      console.log(`${plan}: ${have.id} already there (${(have.unit_amount ?? 0) / 100} ${have.currency})`);
      continue;
    }
    // A Stripe price can't change, so a new amount is a new price that takes over the lookup key. The old one is
    // switched off for new checkouts; people already subscribed to it keep paying what they signed up for.
    const p = await s.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: PRODUCT.prices[plan],
      recurring: { interval: plan },
      lookup_key: PLANS[plan],
      transfer_lookup_key: Boolean(have),
      nickname: `Pro ${plan}ly`,
    });
    if (have) await s.prices.update(have.id, { active: false });
    console.log(`${plan}: ${have ? `replaced ${have.id} (${(have.unit_amount ?? 0) / 100}) with` : "created"} ${p.id} (${PRODUCT.prices[plan] / 100} usd)`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
