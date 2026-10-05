import { z } from "zod";
import { auth } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";

const input = z.object({ email: z.string().trim().max(160) });

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { email } = await body(req, input);
  const token = await auth.createResetToken(email);
  if (token) {
    // No email provider until /replica-backend: the link goes to the dev server log.
    const link = `${new URL(req.url).origin}/reset-password?token=${token}`;
    console.info(`[dev] password reset link for ${email}: ${link}`);
  }
  // Same answer whether or not the account exists.
  return Response.json({ ok: true });
});
