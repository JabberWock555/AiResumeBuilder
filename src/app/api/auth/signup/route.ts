import { z } from "zod";
import { auth } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { startSession } from "@/server/session";

const input = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.email().max(160),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { fullName, email, password } = await body(req, input);
  try {
    const user = await auth.createUser(email, password, fullName);
    await startSession(user.id);
    return Response.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "email_taken")
      return Response.json({ error: "email_taken" }, { status: 409 });
    throw e;
  }
});
