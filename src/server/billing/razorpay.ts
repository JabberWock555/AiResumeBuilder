import "server-only";
import Razorpay from "razorpay";
import { billingStore } from "../repo";
import type { User } from "../repo/types";
import { applyLifetime, applySubscription, validCheckout, type BillingDeps, type RazorpaySubscriptionEntity } from "./events";

// Razorpay: subscriptions for the monthly and 3-monthly plans, a one-off order
// for lifetime. Payment happens in Razorpay Checkout (their modal, opened by
// the upgrade dialog), so no card or UPI details touch our servers. Test keys
// (rzp_test_...) until /replica-deploy.
//
// Env: RAZORPAY_API_KEY (key id), RAZORPAY_SECRET_KEY (key secret),
// RAZORPAY_WEBHOOK_SECRET, RAZORPAY_PLAN_MONTH, RAZORPAY_PLAN_QUARTER (plan ids
// from Dashboard → Subscriptions → Plans), RAZORPAY_LIFETIME_AMOUNT (in paise,
// e.g. 499900 for ₹4,999), RAZORPAY_CURRENCY (default INR).

export type PaidPlan = "month" | "quarter" | "lifetime";

let client: Razorpay | undefined;
export function razorpay() {
  client ??= new Razorpay({ key_id: process.env.RAZORPAY_API_KEY!, key_secret: process.env.RAZORPAY_SECRET_KEY! });
  return client;
}

const PLAN_ENV = { month: "RAZORPAY_PLAN_MONTH", quarter: "RAZORPAY_PLAN_QUARTER" } as const;
const planId = (plan: "month" | "quarter") => process.env[PLAN_ENV[plan]];
const currency = () => (process.env.RAZORPAY_CURRENCY || "INR").toUpperCase();
const lifetimeAmount = () => Number(process.env.RAZORPAY_LIFETIME_AMOUNT || 0);
/** Razorpay needs a fixed number of billing cycles: 10 years either way. */
const TOTAL_COUNT = { month: 120, quarter: 40 } as const;

const planCache = new Map<string, { at: number; info: { kind: "month" | "quarter"; amount: number; currency: string; period: string; interval: number } }>();
async function planDetails(id: string) {
  const kind = id === planId("month") ? "month" : id === planId("quarter") ? "quarter" : null;
  if (!kind) return null;
  const hit = planCache.get(id);
  if (hit && Date.now() - hit.at < 600_000) return hit.info;
  const p = await razorpay().plans.fetch(id);
  const info = { kind, amount: Number(p.item.amount), currency: p.item.currency ?? currency(), period: p.period, interval: p.interval } as const;
  planCache.set(id, { at: Date.now(), info });
  return info;
}

export function billingDeps(paymentFailed: BillingDeps["paymentFailed"]): BillingDeps {
  return {
    planInfo: async (id) => planDetails(id),
    latestSubscription: async (id) => (await razorpay().subscriptions.fetch(id)) as unknown as RazorpaySubscriptionEntity,
    paymentFailed,
  };
}

/** What the browser needs to open Razorpay Checkout. */
export type CheckoutStart = {
  keyId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
} & ({ subscriptionId: string } | { orderId: string; amount: number; currency: string });

export async function startCheckout(user: User, plan: PaidPlan): Promise<CheckoutStart> {
  const base = {
    keyId: process.env.RAZORPAY_API_KEY!,
    name: process.env.NEXT_PUBLIC_PRODUCT_NAME || "Resume Builder",
    prefill: { name: user.fullName, email: user.email },
  };
  const notes = { user_id: user.id, plan };
  if (plan === "lifetime") {
    const amount = lifetimeAmount();
    if (!amount) throw new Error("RAZORPAY_LIFETIME_AMOUNT is not set");
    const order = await razorpay().orders.create({
      amount,
      currency: currency(),
      receipt: `life_${user.id.slice(0, 8)}_${Date.now()}`,
      notes,
    });
    return { ...base, description: "Lifetime Pro", orderId: order.id, amount, currency: order.currency };
  }
  const id = planId(plan);
  if (!id) throw new Error(`${PLAN_ENV[plan]} is not set`);
  const sub = (await razorpay().subscriptions.create({
    plan_id: id,
    total_count: TOTAL_COUNT[plan],
    quantity: 1,
    customer_notify: 1,
    notes,
  })) as unknown as RazorpaySubscriptionEntity;
  // Stored straight away (as not-yet-paid), so the reconcile job knows it exists.
  await applySubscription(billingStore, billingDeps(async () => {}), sub, user.id);
  return { ...base, description: plan === "month" ? "Pro, monthly" : "Pro, every 3 months", subscriptionId: sub.id };
}

/**
 * Razorpay Checkout's success handler posts here. The signature proves the
 * payment is real; the plan is then switched on straight away instead of
 * waiting for the webhook (which still arrives and changes nothing).
 */
export async function verifyCheckout(
  user: User,
  p: { paymentId: string; signature: string } & ({ subscriptionId: string } | { orderId: string }),
) {
  if (!validCheckout(p, process.env.RAZORPAY_SECRET_KEY!)) return { ok: false as const, error: "bad_signature" };
  if ("subscriptionId" in p) {
    const sub = (await razorpay().subscriptions.fetch(p.subscriptionId)) as unknown as RazorpaySubscriptionEntity;
    const owner = sub.notes && !Array.isArray(sub.notes) ? String(sub.notes.user_id ?? "") : "";
    if (owner !== user.id) return { ok: false as const, error: "not_yours" };
    const r = await applySubscription(billingStore, billingDeps(async () => {}), sub, user.id);
    return { ok: true as const, plan: r.plan };
  }
  const order = await razorpay().orders.fetch(p.orderId);
  const notes = order.notes && !Array.isArray(order.notes) ? order.notes : {};
  if (String(notes.user_id ?? "") !== user.id || notes.plan !== "lifetime") return { ok: false as const, error: "not_yours" };
  const payment = await razorpay().payments.fetch(p.paymentId);
  if (payment.order_id !== order.id) return { ok: false as const, error: "not_yours" };
  // With manual capture switched on in the dashboard, capture it here.
  if (payment.status === "authorized") await razorpay().payments.capture(payment.id, Number(payment.amount), payment.currency);
  else if (payment.status !== "captured") return { ok: false as const, error: "not_paid" };
  const plan = await applyLifetime(billingStore, user.id, { id: order.id, amount: Number(order.amount), currency: order.currency }, payment.id);
  return { ok: true as const, plan };
}

/** The subscription a user can cancel: their live monthly or 3-monthly one. */
export async function liveSubscription(userId: string) {
  const { subscriptions } = await billingStore.account(userId);
  return (
    subscriptions.find((s) => s.kind !== "lifetime" && s.providerSubscriptionId && !s.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(s.status)) ??
    null
  );
}

/**
 * Cancel at the end of the paid period. Razorpay can't undo this, so the
 * settings page says so before asking.
 */
export async function cancelAtPeriodEnd(userId: string) {
  const live = await liveSubscription(userId);
  if (!live) return false;
  const sub = (await razorpay().subscriptions.cancel(live.providerSubscriptionId!, true)) as unknown as RazorpaySubscriptionEntity;
  await applySubscription(billingStore, billingDeps(async () => {}), sub, userId, { cancelAtPeriodEnd: true });
  return true;
}

/** Account deletion: stop every subscription now, so nobody is charged for a deleted account. */
export async function cancelAllNow(userId: string) {
  const { subscriptions } = await billingStore.account(userId);
  for (const s of subscriptions) {
    if (!s.providerSubscriptionId || ["canceled", "refunded"].includes(s.status)) continue;
    try {
      await razorpay().subscriptions.cancel(s.providerSubscriptionId, false);
    } catch (e) {
      // "created" subscriptions that were never paid can't be cancelled; nothing to stop.
      if (s.status !== "incomplete") throw e;
    }
  }
}

export type PlanPrice = { plan: PaidPlan; amount: number; currency: string; period: string | null; interval: number | null };

/** Prices as set in the Razorpay dashboard (and env for lifetime), cached for 10 minutes. */
export async function planPrices(): Promise<PlanPrice[]> {
  const out: PlanPrice[] = [];
  for (const plan of ["month", "quarter"] as const) {
    const id = planId(plan);
    if (!id) continue;
    const d = await planDetails(id);
    if (d) out.push({ plan, amount: d.amount, currency: d.currency, period: d.period, interval: d.interval });
  }
  if (lifetimeAmount()) out.push({ plan: "lifetime", amount: lifetimeAmount(), currency: currency(), period: null, interval: null });
  return out;
}
