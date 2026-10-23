import { z } from "zod";
import { auth } from "@/server/repo";
import { appUrl } from "@/server/config";
import { assertSameOrigin, body, handle } from "@/server/http";
import { limit, perKey } from "@/server/rate-limit";
import { requireUser } from "@/server/session";

const input = z.object({ email: z.email().max(160) });

/** Sends a confirmation link to the new address; nothing changes until it's clicked. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { email } = await body(req, input);
  if (email.toLowerCase() === user.email) return Response.json({ error: "same_email" }, { status: 400 });
  await limit(perKey("change-email", user.id, 5, 3600));
  try {
    await auth.changeEmail(email, appUrl(req));
  } catch (e) {
    if (e instanceof Error && e.message === "email_taken") return Response.json({ error: "email_taken" }, { status: 409 });
    throw e;
  }
  return Response.json({ ok: true }, { status: 202 });
});
