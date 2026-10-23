import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingStore, Plan, Subscription } from "../repo/types";
import { processEvent, type BillingDeps } from "./events";

// An in-memory BillingStore with the same plan rule as sync_plan() in
// supabase/migrations/0002_backend.sql (which the schema tests cover).
function memoryStore() {
  const users = new Map<string, { plan: Plan; customer: string | null; subs: Subscription[] }>();
  const events = new Map<string, string | null>();
  const user = (id: string) => {
    if (!users.has(id)) users.set(id, { plan: "free", customer: null, subs: [] });
    return users.get(id)!;
  };
  const sync = (id: string) => {
    const u = user(id);
    u.plan = u.subs.some((s) => s.kind === "lifetime" && s.status === "active")
      ? "lifetime"
      : u.subs.some((s) => s.kind !== "lifetime" && ["active", "trialing", "past_due"].includes(s.status))
        ? "pro"
        : "free";
    return u.plan;
  };
  const store: BillingStore = {
    async account(id) {
      const u = user(id);
      return { plan: u.plan, stripeCustomerId: u.customer, subscriptions: u.subs };
    },
    async setCustomer(id, c) {
      user(id).customer = c;
    },
    async userByCustomer(c) {
      return [...users.entries()].find(([, u]) => u.customer === c)?.[0] ?? null;
    },
    async claimEvent(id) {
      if (!events.has(id)) return events.set(id, null), "new";
      return events.get(id) ? "done" : "retry";
    },
    async finishEvent(id) {
      events.set(id, "done");
    },
    async upsertSubscription(id, s) {
      const u = user(id);
      const i = u.subs.findIndex(
        (x) => (s.stripeSubscriptionId && x.stripeSubscriptionId === s.stripeSubscriptionId) || (s.stripeCheckoutSessionId && x.stripeCheckoutSessionId === s.stripeCheckoutSessionId),
      );
      if (i >= 0) u.subs[i] = s;
      else u.subs.push(s);
      return sync(id);
    },
    async refundLifetime(pi) {
      for (const [id, u] of users) {
        const s = u.subs.find((x) => x.kind === "lifetime" && x.stripePaymentIntentId === pi);
        if (s) return (s.status = "refunded"), sync(id), id;
      }
      return null;
    },
  };
  return { store, user };
}

let n = 0;
const event = (type: string, object: object) => ({ id: `evt_${++n}`, type, data: { object } }) as unknown as Stripe.Event;
const subscription = (over: Partial<Stripe.Subscription> = {}) =>
  ({
    id: "sub_1", object: "subscription", customer: "cus_1", status: "active", currency: "usd", cancel_at_period_end: false, cancel_at: null,
    metadata: { user_id: "u1", plan: "month" },
    items: { data: [{ price: { id: "price_month", unit_amount: 1500 }, current_period_end: 1_800_000_000 }] },
    ...over,
  }) as unknown as Stripe.Subscription;

describe("Stripe webhook events", () => {
  let mem: ReturnType<typeof memoryStore>;
  let deps: BillingDeps;
  beforeEach(() => {
    mem = memoryStore();
    deps = { kindOfPrice: (p) => (p === "price_quarter" ? "quarter" : p === "price_month" ? "month" : null), paymentFailed: vi.fn(async () => {}) };
  });

  it("checkout links the customer; the subscription event makes the user Pro", async () => {
    await processEvent(event("checkout.session.completed", { id: "cs_1", mode: "subscription", client_reference_id: "u1", customer: "cus_1", metadata: { user_id: "u1", plan: "month" } }), mem.store, deps);
    expect(mem.user("u1").customer).toBe("cus_1");
    expect(mem.user("u1").plan).toBe("free");
    await processEvent(event("customer.subscription.created", subscription()), mem.store, deps);
    expect(mem.user("u1").plan).toBe("pro");
    expect(mem.user("u1").subs[0]).toMatchObject({ kind: "month", amountCents: 1500, currentPeriodEnd: new Date(1_800_000_000_000).toISOString() });
  });

  it("finds the user by customer when metadata is missing", async () => {
    await mem.store.setCustomer("u2", "cus_2");
    await processEvent(event("customer.subscription.updated", subscription({ id: "sub_2", customer: "cus_2", metadata: {} })), mem.store, deps);
    expect(mem.user("u2").plan).toBe("pro");
  });

  it("works whichever order checkout and subscription events arrive in", async () => {
    await processEvent(event("customer.subscription.created", subscription()), mem.store, deps);
    await processEvent(event("checkout.session.completed", { id: "cs_1", mode: "subscription", client_reference_id: "u1", customer: "cus_1", metadata: {} }), mem.store, deps);
    expect(mem.user("u1").plan).toBe("pro");
  });

  it("processes a retried event only once", async () => {
    const e = event("customer.subscription.created", subscription());
    expect(await processEvent(e, mem.store, deps)).toBe("processed");
    expect(await processEvent(e, mem.store, deps)).toBe("duplicate");
    expect(mem.user("u1").subs).toHaveLength(1);
  });

  it("re-runs an event whose first attempt failed half-way", async () => {
    const e = event("customer.subscription.created", subscription({ metadata: {}, customer: "cus_unknown" }));
    await expect(processEvent(e, mem.store, deps)).rejects.toThrow(/unknown customer/);
    await mem.store.setCustomer("u1", "cus_unknown");
    expect(await processEvent(e, mem.store, deps)).toBe("processed");
    expect(mem.user("u1").plan).toBe("pro");
  });

  it("keeps Pro while cancelled at period end, drops it when deleted", async () => {
    await processEvent(event("customer.subscription.created", subscription()), mem.store, deps);
    await processEvent(event("customer.subscription.updated", subscription({ cancel_at_period_end: true })), mem.store, deps);
    expect(mem.user("u1").plan).toBe("pro");
    expect(mem.user("u1").subs[0].cancelAtPeriodEnd).toBe(true);
    await processEvent(event("customer.subscription.deleted", subscription({ status: "canceled" })), mem.store, deps);
    expect(mem.user("u1").plan).toBe("free");
  });

  it("keeps Pro while a payment is past due, and emails once per invoice", async () => {
    await processEvent(event("customer.subscription.created", subscription()), mem.store, deps);
    await processEvent(event("customer.subscription.updated", subscription({ status: "past_due" })), mem.store, deps);
    expect(mem.user("u1").plan).toBe("pro");
    await mem.store.setCustomer("u1", "cus_1");
    await processEvent(event("invoice.payment_failed", { customer: "cus_1", attempt_count: 1 }), mem.store, deps);
    await processEvent(event("invoice.payment_failed", { customer: "cus_1", attempt_count: 2 }), mem.store, deps);
    expect(deps.paymentFailed).toHaveBeenCalledTimes(1);
    expect(deps.paymentFailed).toHaveBeenCalledWith("u1");
  });

  it("stores the latest subscription from Stripe, not the event's snapshot", async () => {
    deps.latestSubscription = async () => subscription({ status: "canceled" });
    await processEvent(event("customer.subscription.updated", subscription({ status: "active" })), mem.store, deps);
    expect(mem.user("u1").plan).toBe("free");
  });

  it("lifetime: paid checkout gives Lifetime, a full refund takes it away", async () => {
    const paid = { id: "cs_9", mode: "payment", payment_status: "paid", client_reference_id: "u1", customer: "cus_1", payment_intent: "pi_9", amount_total: 9900, currency: "usd", metadata: { plan: "lifetime" } };
    await processEvent(event("checkout.session.completed", { ...paid, payment_status: "unpaid" }), mem.store, deps);
    expect(mem.user("u1").plan).toBe("free");
    await processEvent(event("checkout.session.async_payment_succeeded", paid), mem.store, deps);
    expect(mem.user("u1").plan).toBe("lifetime");
    await processEvent(event("charge.refunded", { payment_intent: "pi_9", refunded: false }), mem.store, deps);
    expect(mem.user("u1").plan).toBe("lifetime");
    await processEvent(event("charge.refunded", { payment_intent: "pi_9", refunded: true }), mem.store, deps);
    expect(mem.user("u1").plan).toBe("free");
  });

  it("ignores event types it doesn't handle", async () => {
    expect(await processEvent(event("customer.created", {}), mem.store, deps)).toBe("ignored");
  });
});

describe("webhook signatures", () => {
  const secret = "whsec_unit_test_only";
  const payload = JSON.stringify({ id: "evt_sig", object: "event", type: "customer.created", data: { object: {} } });

  it("accepts a correctly signed payload", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(Stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_sig");
  });

  it("rejects a tampered payload or the wrong secret", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => Stripe.webhooks.constructEvent(payload.replace("evt_sig", "evt_bad"), header, secret)).toThrow();
    expect(() => Stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
  });
});
