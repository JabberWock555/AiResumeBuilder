import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/resumes/[id]/target/dismiss">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const { term, dismissed } = await body(req, z.object({ term: z.string().min(1).max(80), dismissed: z.boolean().default(true) }));
  return Response.json({ target: await repo.dismissKeyword(user.id, id, term, dismissed) });
});
