import { auth, billingStore } from "@/server/repo";
import { appUrl } from "@/server/config";
import { sendEmail } from "@/server/email";
import { emails } from "@/server/email-templates";
import { processEvent, validWebhook, type RazorpayWebhook } from "@/server/billing/events";
import { billingDeps } from "@/server/billing/razorpay";

export const runtime = "nodejs";

// Razorpay → us. The signature is checked against the raw body before anything
// else; the event is then applied once (see src/server/billing/events.ts).
// A 500 makes Razorpay retry, which is safe because every handler is idempotent.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const eventId = req.headers.get("x-razorpay-event-id") ?? "";
  if (!secret) return Response.json({ error: "not_configured" }, { status: 400 });

  const raw = await req.text();
  if (!validWebhook(raw, signature, secret)) return Response.json({ error: "bad_signature" }, { status: 400 });
  if (!eventId || eventId.length > 100) return Response.json({ error: "no_event_id" }, { status: 400 });

  let event: RazorpayWebhook;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const deps = billingDeps(async (userId) => {
    const to = await auth.emailOf(userId);
    if (to) await sendEmail(emails.paymentFailed(to, `${appUrl(req)}/app/settings#billing`));
  });
  // Signed test events without API keys (local tests) skip the re-fetch.
  if (!process.env.RAZORPAY_SECRET_KEY) {
    delete deps.latestSubscription;
    deps.planInfo = async () => null;
  }

  try {
    const result = await processEvent(eventId, event, billingStore, deps);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error(`razorpay webhook ${event.event} ${eventId}: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
