import { appUrl, config } from "@/server/config";
import { assertSameOrigin, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { portalUrl } from "@/server/billing/stripe";

/** Opens the Stripe Customer Portal (card, invoices, plan changes). */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!config.billing) return Response.json({ error: "billing_off" }, { status: 503 });
  const url = await portalUrl(user.id, appUrl(req));
  return url ? Response.json({ url }) : Response.json({ error: "no_customer" }, { status: 404 });
});
