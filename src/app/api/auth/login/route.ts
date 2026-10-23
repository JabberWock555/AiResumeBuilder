import { z } from "zod";
import { auth } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { limit, perIp, perKey } from "@/server/rate-limit";

const input = z.object({ email: z.string().trim().max(160), password: z.string().max(200) });

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { email, password } = await body(req, input);
  await limit(perIp("login", req, 30, 900), perKey("login:email", email, 10, 900));
  const result = await auth.signIn(email, password);
  // Same message for unknown email and wrong password.
  if (result === "bad_credentials") return Response.json({ error: "bad_credentials" }, { status: 401 });
  if (result === "unverified") return Response.json({ error: "email_not_verified" }, { status: 403 });
  return Response.json({ ok: true });
});
