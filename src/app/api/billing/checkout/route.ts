import { z } from "zod";
import { billingStore } from "@/server/repo";
import { config } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { limit, perKey } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { startCheckout } from "@/server/billing/razorpay";

const input = z.object({ plan: z.enum(["month", "quarter", "lifetime"]) });

/** Creates the Razorpay subscription or order and returns what Checkout needs to open. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!config.billing) return Response.json({ error: "billing_off" }, { status: 503 });
  const { plan } = await body(req, input);
  await limit(perKey("checkout", user.id, 10, 3600));
  // Already paying: no second purchase.
  if ((await billingStore.account(user.id)).plan !== "free") return Response.json({ error: "already_subscribed" }, { status: 409 });
  return Response.json(await startCheckout(user, plan));
});
