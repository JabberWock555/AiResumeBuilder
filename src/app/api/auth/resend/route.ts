import { z } from "zod";
import { auth } from "@/server/repo";
import { appUrl } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { limit, perIp, perKey } from "@/server/rate-limit";

const input = z.object({ email: z.string().trim().max(160) });

/** Sends the verification email again. Same answer whether or not the account exists. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { email } = await body(req, input);
  await limit(perIp("resend", req, 10, 3600), perKey("resend:email", email, 3, 3600));
  await auth.resendVerification(email, appUrl(req));
  return Response.json({ ok: true });
});
