import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingStore, Subscription } from "../repo/types";

// Razorpay billing logic with no network calls, so it's unit-tested without
// Razorpay or a database (src/server/billing/events.test.ts).
//
// Webhooks are idempotent: each event id (x-razorpay-event-id) is claimed
// once in billing_events, every write is an upsert keyed by a Razorpay id,
// and subscription events re-fetch the subscription so out-of-order events
// can't store stale state. The plan is recomputed from all of a user's
// subscriptions after every write (sync_plan), never set directly.

export type RazorpaySubscriptionEntity = {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired" | "paused";
  current_end?: number | null;
  notes?: Record<string, string | number> | [];
};
type OrderEntity = { id: string; status: string; amount: number; amount_paid?: number; currency: string; notes?: Record<string, string | number> | [] };
type PaymentEntity = { id: string; order_id?: string | null; amount: number; amount_refunded?: number; currency: string; status: string; customer_id?: string | null };
export type RazorpayWebhook = {
  event: string;
  payload: {
    subscription?: { entity: RazorpaySubscriptionEntity };
    payment?: { entity: PaymentEntity };
    order?: { entity: OrderEntity };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
};

export const HANDLED_EVENTS = [
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.updated",
  "subscription.paused",
  "subscription.resumed",
  "order.paid",
  "refund.processed",
] as const;

export type BillingDeps = {
  /** Plan id → our plan and its price, from the RAZORPAY_PLAN_* env vars (and the Plans API for the price). */
  planInfo(planId: string): Promise<{ kind: "month" | "quarter"; amount: number; currency: string } | null>;
  /** The subscription as Razorpay has it now. Optional in tests. */
  latestSubscription?(id: string): Promise<RazorpaySubscriptionEntity>;
  paymentFailed(userId: string): Promise<void>;
};

const hmac = (message: string, secret: string) => createHmac("sha256", secret).update(message).digest("hex");
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Webhook: HMAC-SHA256 of the raw body with the webhook secret (X-Razorpay-Signature). */
export function validWebhook(rawBody: string, signature: string, secret: string) {
  return Boolean(signature) && sameHex(hmac(rawBody, secret), signature);
}

/** Checkout success handler: proves the payment came from Razorpay for this subscription or order. */
export function validCheckout(
  p: { paymentId: string; signature: string } & ({ subscriptionId: string } | { orderId: string }),
  keySecret: string,
) {
  const message = "subscriptionId" in p ? `${p.paymentId}|${p.subscriptionId}` : `${p.orderId}|${p.paymentId}`;
  return sameHex(hmac(message, keySecret), p.signature);
}

const STATUS: Record<RazorpaySubscriptionEntity["status"], Subscription["status"]> = {
  created: "incomplete",
  authenticated: "incomplete",
  active: "active",
  pending: "past_due", // a renewal failed; Razorpay is retrying, Pro stays on
  halted: "unpaid", // retries ran out
  cancelled: "canceled",
  completed: "canceled",
  expired: "canceled",
  paused: "canceled",
};

const note = (notes: RazorpaySubscriptionEntity["notes"], key: string) =>
  notes && !Array.isArray(notes) && notes[key] !== undefined ? String(notes[key]) : undefined;

async function userFor(store: BillingStore, notes: RazorpaySubscriptionEntity["notes"], customerId?: string | null) {
  return note(notes, "user_id") ?? (customerId ? await store.userByCustomer(customerId) : null);
}

/**
 * Stores a subscription as Razorpay reports it. "Cancel at the end of the
 * period" isn't a field on Razorpay's subscription, so the flag we set when
 * the user cancelled is kept until the subscription actually ends.
 */
export async function applySubscription(store: BillingStore, deps: BillingDeps, sub: RazorpaySubscriptionEntity, userId: string, opts: { cancelAtPeriodEnd?: boolean } = {}) {
  const info = await deps.planInfo(sub.plan_id);
  const metaKind = note(sub.notes, "plan");
  const kind = metaKind === "month" || metaKind === "quarter" ? metaKind : (info?.kind ?? "month");
  const prev = (await store.account(userId)).subscriptions.find((s) => s.providerSubscriptionId === sub.id);
  const status = STATUS[sub.status] ?? "canceled";
  if (sub.customer_id) await store.setCustomer(userId, sub.customer_id);
  const plan = await store.upsertSubscription(userId, {
    kind,
    status,
    providerSubscriptionId: sub.id,
    providerCheckoutId: null,
    providerPaymentId: null,
    providerPlanId: sub.plan_id,
    amountCents: info?.amount ?? prev?.amountCents ?? 0,
    currency: (info?.currency ?? prev?.currency ?? "INR").toLowerCase(),
    currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : (prev?.currentPeriodEnd ?? null),
    cancelAtPeriodEnd: status === "active" || status === "past_due" ? (opts.cancelAtPeriodEnd ?? prev?.cancelAtPeriodEnd ?? false) : false,
  });
  return { plan, previousStatus: prev?.status ?? null, status };
}

/** Stores a paid lifetime order (one-off payment). */
export async function applyLifetime(store: BillingStore, userId: string, order: { id: string; amount: number; currency: string }, paymentId: string) {
  return store.upsertSubscription(userId, {
    kind: "lifetime",
    status: "active",
    providerSubscriptionId: null,
    providerCheckoutId: order.id,
    providerPaymentId: paymentId,
    providerPlanId: null,
    amountCents: order.amount,
    currency: order.currency.toLowerCase(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

export async function processEvent(eventId: string, event: RazorpayWebhook, store: BillingStore, deps: BillingDeps) {
  if (!(HANDLED_EVENTS as readonly string[]).includes(event.event)) return "ignored" as const;
  if ((await store.claimEvent(eventId, event.event)) === "done") return "duplicate" as const;
  await apply(event, store, deps);
  await store.finishEvent(eventId);
  return "processed" as const;
}

async function apply(event: RazorpayWebhook, store: BillingStore, deps: BillingDeps) {
  const p = event.payload;

  if (event.event.startsWith("subscription.")) {
    let sub = p.subscription?.entity;
    if (!sub) throw new Error(`${event.event} without a subscription`);
    if (deps.latestSubscription) sub = await deps.latestSubscription(sub.id);
    const userId = await userFor(store, sub.notes, sub.customer_id);
    // Throwing makes Razorpay retry; the reconcile job also picks it up.
    if (!userId) throw new Error("subscription for an unknown user");
    const r = await applySubscription(store, deps, sub, userId);
    // Email once when a renewal first fails, not on every retry.
    if (r.status === "past_due" && r.previousStatus !== "past_due") await deps.paymentFailed(userId);
    return;
  }

  if (event.event === "order.paid") {
    const order = p.order?.entity;
    const payment = p.payment?.entity;
    if (!order || !payment || note(order.notes, "plan") !== "lifetime") return;
    const userId = note(order.notes, "user_id");
    if (!userId) throw new Error("lifetime order without a user");
    await applyLifetime(store, userId, order, payment.id);
    return;
  }

  if (event.event === "refund.processed") {
    const payment = p.payment?.entity;
    // A full refund of a lifetime purchase takes the plan away; partial refunds don't.
    if (payment && (payment.amount_refunded ?? 0) >= payment.amount) await store.refundLifetime(payment.id);
  }
}
