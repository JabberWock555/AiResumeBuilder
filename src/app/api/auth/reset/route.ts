import { z } from "zod";
import { auth } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";

const input = z.object({ token: z.string().min(10).max(200), password: z.string().min(10).max(200) });

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { token, password } = await body(req, input);
  const ok = await auth.resetPassword(token, password);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "invalid_token" }, { status: 400 });
});
