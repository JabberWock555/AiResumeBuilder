#!/usr/bin/env node
// Sends signed Stripe test events to the local webhook route and checks the
// app's state after each one, with no Stripe account: the events are built
// here and signed with a local-only secret. Runs on the local data layer
// against the seeded demo account (npm run seed -- --reset).
//
//   STRIPE_WEBHOOK_SECRET=whsec_local_webhook_check_only npm run dev
//   npm run webhook:check
//
// With real test keys, use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
// and `stripe trigger checkout.session.completed` instead.

import { readFile } from "node:fs/promises";
import Stripe from "stripe";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.WEBHOOK_CHECK_SECRET ?? "whsec_local_webhook_check_only";
// The demo login from scripts/seed.mjs (local only).
const seed = await readFile(new URL("./seed.mjs", import.meta.url), "utf8");
const EMAIL = seed.match(/const EMAIL = "([^"]+)"/)[1];
const PASSWORD = seed.match(/const PASSWORD = "([^"]+)"/)[1];

let pass = 0;
let fail = 0;
const ok = (name, good, detail = "") => {
  if (good) pass++;
  else fail++;
  console.log(`${good ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error(`demo login failed (${login.status}); run npm run seed -- --reset`);
const me = async () => (await (await fetch(`${BASE}/api/me`, { headers: { cookie } })).json()).user;
const settings = async () => (await fetch(`${BASE}/app/settings`, { headers: { cookie } })).text();
const userId = (await me()).id;

let n = 0;
async function send(type, object, { secret = SECRET, id = `evt_check_${Date.now()}_${++n}` } = {}) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const r = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  return { status: r.status, body: await r.json().catch(() => ({})), id };
}

const sub = (over = {}) => ({
  id: "sub_check_1", object: "subscription", customer: "cus_check_1", status: "active", currency: "usd", cancel_at_period_end: false, cancel_at: null,
  metadata: { user_id: userId, plan: "month" },
  items: { data: [{ price: { id: "price_check_month", unit_amount: 1500 }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
  ...over,
});

ok("starts on Free", (await me()).plan === "free");
ok("a bad signature is refused", (await send("customer.subscription.created", sub(), { secret: "whsec_wrong" })).status === 400);

let r = await send("checkout.session.completed", { id: "cs_check_1", mode: "subscription", client_reference_id: userId, customer: "cus_check_1", metadata: { user_id: userId, plan: "month" } });
ok("checkout.session.completed accepted", r.status === 200 && r.body.result === "processed", JSON.stringify(r.body));
r = await send("customer.subscription.created", sub());
ok("subscription.created makes the user Pro", r.status === 200 && (await me()).plan === "pro", JSON.stringify(r.body));
ok("settings shows the plan and renewal date", /Pro, monthly[\s\S]*Renews on/.test(await settings()));

const again = await send("customer.subscription.created", sub(), { id: r.id });
ok("a replayed event is skipped", again.body.result === "duplicate", JSON.stringify(again.body));

await send("customer.subscription.updated", sub({ cancel_at_period_end: true }));
const page = await settings();
ok("cancel at period end keeps Pro and says when it ends", (await me()).plan === "pro" && /Cancelled\. You keep Pro until/.test(page));

await send("invoice.payment_failed", { customer: "cus_check_1", attempt_count: 1, parent: null });
const outbox = (await readFile(".data/outbox.jsonl", "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
ok("payment failure emails the user", outbox.some((m) => m.to === EMAIL && m.tag === "payment_failed"));

await send("customer.subscription.deleted", sub({ status: "canceled" }));
ok("subscription.deleted moves the user back to Free", (await me()).plan === "free");

await send("checkout.session.completed", {
  id: "cs_check_life", mode: "payment", payment_status: "paid", client_reference_id: userId, customer: "cus_check_1",
  payment_intent: "pi_check_life", amount_total: 9900, currency: "usd", metadata: { user_id: userId, plan: "lifetime" },
});
ok("a paid lifetime checkout gives Lifetime", (await me()).plan === "lifetime");
await send("charge.refunded", { payment_intent: "pi_check_life", refunded: true });
ok("a full refund takes Lifetime away", (await me()).plan === "free");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
