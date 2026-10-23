import { z } from "zod";
import { billingStore } from "@/server/repo";
import { appUrl, config } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { limit, perKey } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { startCheckout } from "@/server/billing/stripe";

const input = z.object({ plan: z.enum(["month", "quarter", "lifetime"]) });

/** Starts Stripe Checkout and returns its URL. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!config.billing) return Response.json({ error: "billing_off" }, { status: 503 });
  const { plan } = await body(req, input);
  await limit(perKey("checkout", user.id, 10, 3600));
  // Already paying: plan changes go through the portal, not a second checkout.
  if ((await billingStore.account(user.id)).plan !== "free") return Response.json({ error: "already_subscribed" }, { status: 409 });
  return Response.json({ url: await startCheckout(user, plan, appUrl(req)) });
});
