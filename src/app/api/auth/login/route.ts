import { z } from "zod";
import { auth } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { startSession } from "@/server/session";

const input = z.object({ email: z.string().trim().max(160), password: z.string().max(200) });

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { email, password } = await body(req, input);
  const user = await auth.verifyPassword(email, password);
  // Same message for unknown email and wrong password.
  if (!user) return Response.json({ error: "bad_credentials" }, { status: 401 });
  await startSession(user.id);
  return Response.json({ user });
});
