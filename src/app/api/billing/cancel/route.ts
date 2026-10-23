import { z } from "zod";
import { config } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { setCancelAtPeriodEnd } from "@/server/billing/stripe";

const input = z.object({ cancel: z.boolean() });

/**
 * One-click cancel (and undo), right in our settings: the plan stays until
 * the end of the period that's already paid for.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!config.billing) return Response.json({ error: "billing_off" }, { status: 503 });
  const { cancel } = await body(req, input);
  const result = await setCancelAtPeriodEnd(user.id, cancel);
  return result === null ? Response.json({ error: "no_subscription" }, { status: 404 }) : Response.json({ cancelAtPeriodEnd: result });
});
