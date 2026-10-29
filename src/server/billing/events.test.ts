import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingStore, Plan, Subscription } from "../repo/types";
import { applySubscription, processEvent, validCheckout, validWebhook, type BillingDeps, type RazorpayWebhook } from "./events";

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
      return { plan: u.plan, customerId: u.customer, subscriptions: structuredClone(u.subs) };
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
        (x) => (s.providerSubscriptionId && x.providerSubscriptionId === s.providerSubscriptionId) || (s.providerCheckoutId && x.providerCheckoutId === s.providerCheckoutId),
      );
      if (i >= 0) u.subs[i] = s;
      else u.subs.push(s);
      return sync(id);
    },
    async refundLifetime(pay) {
      for (const [id, u] of users) {
        const s = u.subs.find((x) => x.kind === "lifetime" && x.providerPaymentId === pay);
        if (s) return (s.status = "refunded"), sync(id), id;
      }
      return null;
    },
    async openSubscriptions() {
      return [];
    },
  };
  return { store, user };
}

let n = 0;
const ev = (event: string, payload: RazorpayWebhook["payload"]) => ({ id: `evt_${++n}`, body: { event, payload } as RazorpayWebhook });
const sub = (over: Partial<NonNullable<RazorpayWebhook["payload"]["subscription"]>["entity"]> = {}) => ({
  id: "sub_1", plan_id: "plan_month", customer_id: "cust_1", status: "active" as const, current_end: 1_800_000_000,
  notes: { user_id: "u1", plan: "month" }, ...over,
});

describe("Razorpay webhook events", () => {
  let mem: ReturnType<typeof memoryStore>;
  let deps: BillingDeps;
  beforeEach(() => {
    mem = memoryStore();
    deps = {
      planInfo: async (id) => (id === "plan_month" ? { kind: "month", amount: 49900, currency: "INR" } : id === "plan_quarter" ? { kind: "quarter", amount: 119900, currency: "INR" } : null),
      paymentFailed: vi.fn(async () => {}),
    };
  });
  const run = (e: ReturnType<typeof ev>) => processEvent(e.id, e.body, mem.store, deps);

  it("activated subscription makes the user Pro, with price, period end and customer", async () => {
    await run(ev("subscription.activated", { subscription: { entity: sub() } }));
    const u = mem.user("u1");
    expect(u.plan).toBe("pro");
    expect(u.customer).toBe("cust_1");
    expect(u.subs[0]).toMatchObject({ kind: "month", amountCents: 49900, currency: "inr", currentPeriodEnd: new Date(1_800_000_000_000).toISOString(), providerPlanId: "plan_month" });
  });

  it("a created or authenticated subscription isn't Pro yet", async () => {
    await run(ev("subscription.authenticated", { subscription: { entity: sub({ status: "authenticated" }) } }));
    expect(mem.user("u1").plan).toBe("free");
  });

  it("finds the user by customer when notes are missing", async () => {
    await mem.store.setCustomer("u2", "cust_2");
    await run(ev("subscription.charged", { subscription: { entity: sub({ id: "sub_2", customer_id: "cust_2", notes: [] }) } }));
    expect(mem.user("u2").plan).toBe("pro");
  });

  it("processes a retried event only once", async () => {
    const e = ev("subscription.charged", { subscription: { entity: sub() } });
    expect(await run(e)).toBe("processed");
    expect(await run(e)).toBe("duplicate");
    expect(mem.user("u1").subs).toHaveLength(1);
  });

  it("re-runs an event whose first attempt failed", async () => {
    const e = ev("subscription.activated", { subscription: { entity: sub({ notes: [], customer_id: "cust_unknown" }) } });
    await expect(run(e)).rejects.toThrow(/unknown user/);
    await mem.store.setCustomer("u1", "cust_unknown");
    expect(await run(e)).toBe("processed");
    expect(mem.user("u1").plan).toBe("pro");
  });

  it("stores the latest state from Razorpay, not the event's copy", async () => {
    deps.latestSubscription = async () => sub({ status: "cancelled" });
    await run(ev("subscription.charged", { subscription: { entity: sub({ status: "active" }) } }));
    expect(mem.user("u1").plan).toBe("free");
  });

  it("a failed renewal keeps Pro and emails once; halted drops it", async () => {
    await run(ev("subscription.activated", { subscription: { entity: sub() } }));
    await run(ev("subscription.pending", { subscription: { entity: sub({ status: "pending" }) } }));
    await run(ev("subscription.pending", { subscription: { entity: sub({ status: "pending" }) } }));
    expect(mem.user("u1").plan).toBe("pro");
    expect(deps.paymentFailed).toHaveBeenCalledTimes(1);
    await run(ev("subscription.halted", { subscription: { entity: sub({ status: "halted" }) } }));
    expect(mem.user("u1").plan).toBe("free");
  });

  it("cancel at period end is kept through later events, and cleared when it ends", async () => {
    await applySubscription(mem.store, deps, sub(), "u1", { cancelAtPeriodEnd: true });
    await run(ev("subscription.charged", { subscription: { entity: sub() } }));
    expect(mem.user("u1").subs[0].cancelAtPeriodEnd).toBe(true);
    expect(mem.user("u1").plan).toBe("pro");
    await run(ev("subscription.cancelled", { subscription: { entity: sub({ status: "cancelled" }) } }));
    expect(mem.user("u1").plan).toBe("free");
    expect(mem.user("u1").subs[0].cancelAtPeriodEnd).toBe(false);
  });

  it("lifetime: a paid order gives Lifetime, a full refund takes it away, a partial one doesn't", async () => {
    const order = { id: "order_1", status: "paid", amount: 999900, currency: "INR", notes: { user_id: "u1", plan: "lifetime" } };
    const payment = { id: "pay_1", order_id: "order_1", amount: 999900, currency: "INR", status: "captured" };
    await run(ev("order.paid", { order: { entity: order }, payment: { entity: payment } }));
    expect(mem.user("u1").plan).toBe("lifetime");
    await run(ev("refund.processed", { payment: { entity: { ...payment, amount_refunded: 100 } } }));
    expect(mem.user("u1").plan).toBe("lifetime");
    await run(ev("refund.processed", { payment: { entity: { ...payment, amount_refunded: 999900 } } }));
    expect(mem.user("u1").plan).toBe("free");
  });

  it("ignores orders that aren't lifetime purchases and events it doesn't handle", async () => {
    await run(ev("order.paid", { order: { entity: { id: "o", status: "paid", amount: 1, currency: "INR", notes: { user_id: "u1" } } }, payment: { entity: { id: "p", amount: 1, currency: "INR", status: "captured" } } }));
    expect(mem.user("u1").plan).toBe("free");
    expect(await run(ev("payment.authorized", {}))).toBe("ignored");
  });
});

describe("signatures", () => {
  const secret = "unit_test_secret";
  const body = JSON.stringify({ event: "subscription.charged", payload: {} });
  const sign = (m: string, k = secret) => createHmac("sha256", k).update(m).digest("hex");

  it("accepts a correctly signed webhook and rejects tampering or the wrong secret", () => {
    expect(validWebhook(body, sign(body), secret)).toBe(true);
    expect(validWebhook(body.replace("charged", "cancelled"), sign(body), secret)).toBe(false);
    expect(validWebhook(body, sign(body, "other"), secret)).toBe(false);
    expect(validWebhook(body, "", secret)).toBe(false);
  });

  it("checks the checkout signature for subscriptions (payment|subscription) and orders (order|payment)", () => {
    expect(validCheckout({ paymentId: "pay_1", subscriptionId: "sub_1", signature: sign("pay_1|sub_1") }, secret)).toBe(true);
    expect(validCheckout({ paymentId: "pay_1", subscriptionId: "sub_2", signature: sign("pay_1|sub_1") }, secret)).toBe(false);
    expect(validCheckout({ paymentId: "pay_1", orderId: "order_1", signature: sign("order_1|pay_1") }, secret)).toBe(true);
    expect(validCheckout({ paymentId: "pay_1", orderId: "order_1", signature: sign("pay_1|order_1") }, secret)).toBe(false);
  });
});
