import { config } from "@/server/config";
import { handle } from "@/server/http";
import { planPrices } from "@/server/billing/razorpay";

/** The prices set in Razorpay, for the upgrade dialog. Public. */
export const GET = handle(async () => {
  if (!config.billing) return Response.json({ enabled: false, plans: [] });
  return Response.json({ enabled: true, plans: await planPrices() }, { headers: { "cache-control": "public, max-age=600" } });
});
