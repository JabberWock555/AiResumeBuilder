import "server-only";
import Stripe from "stripe";
import { billingStore } from "../repo";
import type { Subscription, User } from "../repo/types";
import { fromStripeSubscription, type BillingDeps } from "./events";

// Stripe Checkout to start a plan, the Customer Portal to change card or
// plan, and a one-click cancel in our own settings. No card forms here.
// Test keys (sk_test_...) until /replica-deploy switches to live ones.

export type PaidPlan = "month" | "quarter" | "lifetime";

let client: Stripe | undefined;
export function stripe() {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, appInfo: { name: "resume-builder" } });
  return client;
}

const PRICE_ENV: Record<PaidPlan, string> = {
  month: "STRIPE_PRICE_MONTH",
  quarter: "STRIPE_PRICE_QUARTER",
  lifetime: "STRIPE_PRICE_LIFETIME",
};
const priceOf = (plan: PaidPlan) => process.env[PRICE_ENV[plan]];

export function kindOfPrice(priceId: string): Subscription["kind"] | null {
  for (const plan of Object.keys(PRICE_ENV) as PaidPlan[]) if (priceOf(plan) === priceId) return plan;
  return null;
}

/** The Stripe customer for this user, created on first checkout. */
async function ensureCustomer(user: User) {
  const account = await billingStore.account(user.id);
  if (account.stripeCustomerId) return account.stripeCustomerId;
  const c = await stripe().customers.create(
    { email: user.email, name: user.fullName || undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await billingStore.setCustomer(user.id, c.id);
  return c.id;
}

export async function startCheckout(user: User, plan: PaidPlan, origin: string) {
  const price = priceOf(plan);
  if (!price) throw new Error(`${PRICE_ENV[plan]} is not set`);
  const customer = await ensureCustomer(user);
  const meta = { user_id: user.id, plan };
  const session = await stripe().checkout.sessions.create({
    mode: plan === "lifetime" ? "payment" : "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    metadata: meta,
    ...(plan === "lifetime" ? { payment_intent_data: { metadata: meta } } : { subscription_data: { metadata: meta } }),
    allow_promotion_codes: true,
    success_url: `${origin}/app/settings?billing=success`,
    cancel_url: `${origin}/app/settings?billing=cancelled`,
  });
  return session.url!;
}

export async function portalUrl(userId: string, origin: string) {
  const { stripeCustomerId } = await billingStore.account(userId);
  if (!stripeCustomerId) return null;
  const s = await stripe().billingPortal.sessions.create({ customer: stripeCustomerId, return_url: `${origin}/app/settings#billing` });
  return s.url;
}

/** The subscription a user can cancel or resume: their live monthly or quarterly one. */
export async function liveSubscription(userId: string) {
  const { subscriptions } = await billingStore.account(userId);
  return subscriptions.find((s) => s.kind !== "lifetime" && s.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(s.status)) ?? null;
}

/**
 * Cancel at the end of the paid period (or undo that). The result is stored
 * straight away so the page shows it; the webhook that follows is a no-op.
 */
export async function setCancelAtPeriodEnd(userId: string, cancel: boolean) {
  const live = await liveSubscription(userId);
  if (!live) return null;
  const sub = await stripe().subscriptions.update(live.stripeSubscriptionId!, { cancel_at_period_end: cancel });
  await billingStore.upsertSubscription(userId, fromStripeSubscription(sub, { kindOfPrice }));
  return sub.cancel_at_period_end;
}

/** Account deletion: deleting the customer cancels every subscription at once. */
export async function deleteCustomer(userId: string) {
  const { stripeCustomerId } = await billingStore.account(userId);
  if (stripeCustomerId) await stripe().customers.del(stripeCustomerId);
}

export function billingDeps(paymentFailed: BillingDeps["paymentFailed"]): BillingDeps {
  return {
    kindOfPrice,
    latestSubscription: (id) => stripe().subscriptions.retrieve(id),
    paymentFailed,
  };
}

type PlanPrice = { plan: PaidPlan; amount: number; currency: string; interval: string | null; intervalCount: number | null };
let priceCache: { at: number; plans: PlanPrice[] } | undefined;

/** Prices as set in the Stripe dashboard, cached for 10 minutes. */
export async function planPrices(): Promise<PlanPrice[]> {
  if (priceCache && Date.now() - priceCache.at < 600_000) return priceCache.plans;
  const plans: PlanPrice[] = [];
  for (const plan of Object.keys(PRICE_ENV) as PaidPlan[]) {
    const id = priceOf(plan);
    if (!id) continue;
    const p = await stripe().prices.retrieve(id);
    plans.push({
      plan,
      amount: p.unit_amount ?? 0,
      currency: p.currency,
      interval: p.recurring?.interval ?? null,
      intervalCount: p.recurring?.interval_count ?? null,
    });
  }
  priceCache = { at: Date.now(), plans };
  return plans;
}
