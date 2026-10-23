import { z } from "zod";
import { auth } from "@/server/repo";
import { appUrl } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { limit, perIp, perKey } from "@/server/rate-limit";

const input = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.email().max(160),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { fullName, email, password } = await body(req, input);
  await limit(perIp("signup", req, 10, 3600), perKey("signup:email", email, 3, 3600));
  // The same answer for new and existing addresses; the email says which.
  const status = await auth.signUp({ email, password, fullName, origin: appUrl(req) });
  return Response.json({ status }, { status: 202 });
});
