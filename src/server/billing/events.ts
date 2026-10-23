import type Stripe from "stripe";
import type { BillingStore, Subscription } from "../repo/types";

// Applies Stripe webhook events to our database. Pure logic over a
// BillingStore, so it's unit-tested without Stripe or a database
// (src/server/billing/events.test.ts).
//
// Idempotent: each event id is claimed once (stripe_events) and every write
// is an upsert keyed by a Stripe id, so a retried or replayed event changes
// nothing. The plan itself is recomputed from all of a user's subscriptions
// after every write (sync_plan), never set directly.

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "charge.refunded",
] as const;

export type BillingDeps = {
  /** Price id → plan, from the STRIPE_PRICE_* env vars. */
  kindOfPrice(priceId: string): Subscription["kind"] | null;
  /**
   * Fetches the subscription's current state from Stripe. Events can arrive
   * out of order, so the latest object is what gets stored. Optional in tests.
   */
  latestSubscription?(id: string): Promise<Stripe.Subscription>;
  paymentFailed(userId: string): Promise<void>;
};

export async function processEvent(event: Stripe.Event, store: BillingStore, deps: BillingDeps) {
  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) return "ignored" as const;
  if ((await store.claimEvent(event.id, event.type)) === "done") return "duplicate" as const;
  await apply(event, store, deps);
  await store.finishEvent(event.id);
  return "processed" as const;
}

const id = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : (x?.id ?? null));
const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

const STATUS: Record<Stripe.Subscription.Status, Subscription["status"]> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  unpaid: "unpaid",
  paused: "canceled",
};

async function userFor(store: BillingStore, metadata: Stripe.Metadata | null | undefined, customer: string | null) {
  const fromMeta = metadata?.user_id;
  if (fromMeta) return fromMeta;
  return customer ? store.userByCustomer(customer) : null;
}

export function fromStripeSubscription(sub: Stripe.Subscription, deps: Pick<BillingDeps, "kindOfPrice">): Subscription {
  const item = sub.items.data[0];
  const metaKind = sub.metadata?.plan;
  const kind =
    metaKind === "month" || metaKind === "quarter" ? metaKind : (item && deps.kindOfPrice(item.price.id)) || "month";
  return {
    kind: kind === "lifetime" ? "month" : kind,
    status: STATUS[sub.status] ?? "canceled",
    stripeSubscriptionId: sub.id,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    stripePriceId: item?.price.id ?? null,
    amountCents: item?.price.unit_amount ?? 0,
    currency: sub.currency,
    currentPeriodEnd: iso(item?.current_period_end),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  };
}

async function apply(event: Stripe.Event, store: BillingStore, deps: BillingDeps) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const userId = s.client_reference_id || s.metadata?.user_id;
      if (!userId) throw new Error("checkout session without a user");
      const customer = id(s.customer);
      if (customer) await store.setCustomer(userId, customer);
      // Subscriptions are stored from their own events; a lifetime purchase is a
      // one-off payment, so it's stored here once it's actually paid.
      if (s.mode === "payment" && s.metadata?.plan === "lifetime" && s.payment_status === "paid") {
        await store.upsertSubscription(userId, {
          kind: "lifetime",
          status: "active",
          stripeSubscriptionId: null,
          stripeCheckoutSessionId: s.id,
          stripePaymentIntentId: id(s.payment_intent),
          stripePriceId: null,
          amountCents: s.amount_total ?? 0,
          currency: s.currency ?? "usd",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        });
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      let sub = event.data.object;
      if (deps.latestSubscription && event.type !== "customer.subscription.deleted") sub = await deps.latestSubscription(sub.id);
      const userId = await userFor(store, sub.metadata, id(sub.customer));
      // Throwing makes Stripe retry; the checkout event links the customer meanwhile.
      if (!userId) throw new Error("subscription for an unknown customer");
      await store.upsertSubscription(userId, fromStripeSubscription(sub, deps));
      return;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object;
      // Email once per invoice, not on every automatic retry.
      if ((inv.attempt_count ?? 1) > 1) return;
      const userId = await userFor(store, inv.parent?.subscription_details?.metadata, id(inv.customer));
      if (userId) await deps.paymentFailed(userId);
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const pi = id(charge.payment_intent);
      // A full refund of a lifetime purchase takes the plan away; partial refunds don't.
      if (pi && charge.refunded) await store.refundLifetime(pi);
      return;
    }
  }
}
