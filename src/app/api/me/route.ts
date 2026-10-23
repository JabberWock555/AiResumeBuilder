import { z } from "zod";
import { auth, repo } from "@/server/repo";
import { config } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { deleteCustomer } from "@/server/billing/stripe";
import { purgeUserFiles } from "@/server/storage";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ user, usage: await repo.usage(user.id) });
});

const patch = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  appLanguage: z.string().max(10).optional(),
  onboarding: z.record(z.string().max(40), z.string().max(80)).refine((o) => Object.keys(o).length <= 10).optional(),
});

export const PATCH = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  return Response.json({ user: await repo.updateUser(user.id, await body(req, patch)) });
});

export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { confirmEmail } = await body(req, z.object({ confirmEmail: z.string().max(160) }));
  if (confirmEmail.trim().toLowerCase() !== user.email) return Response.json({ error: "email_mismatch" }, { status: 400 });
  // In this order, so nothing is left behind if a step fails: stop billing
  // (deleting the Stripe customer cancels its subscriptions), remove uploaded
  // files, then the auth user, which cascades to every table.
  if (config.billing) await deleteCustomer(user.id);
  await purgeUserFiles(user.id);
  await auth.deleteUser(user.id);
  return new Response(null, { status: 204 });
});
