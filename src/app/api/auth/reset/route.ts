import { z } from "zod";
import { auth } from "@/server/repo";
import { AuthError } from "@/server/errors";
import { assertSameOrigin, body, handle } from "@/server/http";

const input = z.object({ password: z.string().min(10).max(200) });

/**
 * Sets a new password. Needs a session: the reset link signs the user in
 * (/auth/confirm), and so does being logged in already. Every other session
 * is signed out afterwards.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { password } = await body(req, input);
  if (!(await auth.currentUserId())) throw new AuthError();
  await auth.updatePassword(password);
  await auth.signOut("others");
  return Response.json({ ok: true });
});
