import { config } from "@/server/config";
import { handle } from "@/server/http";
import { planPrices } from "@/server/billing/stripe";

/** The prices set in Stripe, for the upgrade dialog. Public. */
export const GET = handle(async () => {
  if (!config.billing) return Response.json({ enabled: false, plans: [] });
  return Response.json({ enabled: true, plans: await planPrices() }, { headers: { "cache-control": "public, max-age=600" } });
});
