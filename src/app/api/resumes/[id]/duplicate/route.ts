import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/resumes/[id]/duplicate">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(120).optional() }));
  const copy = await repo.duplicateResume(user.id, id, name);
  return Response.json({ id: copy.id }, { status: 201 });
});
