import Stripe from "stripe";
import { auth, billingStore } from "@/server/repo";
import { appUrl } from "@/server/config";
import { sendEmail } from "@/server/email";
import { emails } from "@/server/email-templates";
import { processEvent } from "@/server/billing/events";
import { billingDeps } from "@/server/billing/stripe";

export const runtime = "nodejs";

// Stripe → us. The signature is checked against the raw body before anything
// else; the event is then applied once (see src/server/billing/events.ts).
// A 500 makes Stripe retry, which is safe because every handler is idempotent.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return Response.json({ error: "not_configured" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }

  const deps = billingDeps(async (userId) => {
    const to = await auth.emailOf(userId);
    if (to) await sendEmail(emails.paymentFailed(to, `${appUrl(req)}/app/settings#billing`));
  });
  // Test events without a secret key (unit tests, `stripe trigger` before keys are set) skip the refetch.
  if (!process.env.STRIPE_SECRET_KEY) delete deps.latestSubscription;

  try {
    const result = await processEvent(event, billingStore, deps);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error(`stripe webhook ${event.type} ${event.id}: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
