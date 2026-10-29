import { z } from "zod";
import { config } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { limit, perKey } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { verifyCheckout } from "@/server/billing/razorpay";

const id = z.string().min(5).max(64).regex(/^[A-Za-z0-9_]+$/);
const input = z.union([
  z.object({ razorpay_payment_id: id, razorpay_subscription_id: id, razorpay_signature: z.string().max(128) }),
  z.object({ razorpay_payment_id: id, razorpay_order_id: id, razorpay_signature: z.string().max(128) }),
]);

/** Razorpay Checkout's success handler posts its result here. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!config.billing) return Response.json({ error: "billing_off" }, { status: 503 });
  await limit(perKey("verify", user.id, 20, 3600));
  const p = await body(req, input);
  const r = await verifyCheckout(
    user,
    "razorpay_subscription_id" in p
      ? { paymentId: p.razorpay_payment_id, subscriptionId: p.razorpay_subscription_id, signature: p.razorpay_signature }
      : { paymentId: p.razorpay_payment_id, orderId: p.razorpay_order_id, signature: p.razorpay_signature },
  );
  return r.ok ? Response.json({ plan: r.plan }) : Response.json({ error: r.error }, { status: 400 });
});
