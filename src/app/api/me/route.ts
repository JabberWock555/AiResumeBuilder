import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { endSession, requireUser } from "@/server/session";

export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ user, usage: await repo.usage(user.id) });
});

const patch = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  appLanguage: z.string().max(10).optional(),
  onboarding: z.record(z.string().max(40), z.string().max(80)).optional(),
});

export const PATCH = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  return Response.json({ user: await repo.updateUser(user.id, await body(req, patch)) });
});

export const DELETE = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { confirmEmail } = await body(req, z.object({ confirmEmail: z.string() }));
  if (confirmEmail.trim().toLowerCase() !== user.email) return Response.json({ error: "email_mismatch" }, { status: 400 });
  // With Supabase this also cancels Stripe and empties storage (replica/architecture.md).
  await repo.deleteUser(user.id);
  await endSession();
  return new Response(null, { status: 204 });
});
