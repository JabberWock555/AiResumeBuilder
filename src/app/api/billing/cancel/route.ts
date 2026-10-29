import { config } from "@/server/config";
import { assertSameOrigin, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { cancelAtPeriodEnd } from "@/server/billing/razorpay";

/** One-click cancel: Pro stays until the end of the period that's paid for. Razorpay can't undo it. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!config.billing) return Response.json({ error: "billing_off" }, { status: 503 });
  return (await cancelAtPeriodEnd(user.id))
    ? Response.json({ cancelAtPeriodEnd: true })
    : Response.json({ error: "no_subscription" }, { status: 404 });
});
