import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { NotFoundError } from "@/server/errors";
import { keywordsForTarget } from "@/server/ai/keywords";

export const maxDuration = 30;

const input = z.object({
  title: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).default(""),
  description: z.string().trim().min(50, "Paste the whole job ad (at least 50 characters)").max(20000),
});

export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/resumes/[id]/target">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const t = await body(req, input);
  if (!(await repo.getResume(user.id, id))) throw new NotFoundError("resume_not_found");
  const target = await repo.setTarget(user.id, id, { ...t, ...(await keywordsForTarget(user.id, id, t.description)) });
  return Response.json({ target });
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/resumes/[id]/target">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  await repo.deleteTarget(user.id, id);
  return new Response(null, { status: 204 });
});
