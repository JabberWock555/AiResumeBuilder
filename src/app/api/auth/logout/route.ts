import { z } from "zod";
import { auth } from "@/server/repo";
import { assertSameOrigin, handle } from "@/server/http";

const input = z.object({ everywhere: z.boolean().default(false) });

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  let raw: unknown = {};
  try {
    raw = JSON.parse((await req.text()) || "{}");
  } catch {}
  const everywhere = input.safeParse(raw).data?.everywhere ?? false;
  await auth.signOut(everywhere ? "global" : "local");
  return new Response(null, { status: 204 });
});
