import { z } from "zod";
import { repo } from "@/server/repo";
import { NotFoundError } from "@/server/errors";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { TEMPLATES, experienceLevel, resumeContent, resumeSettings } from "@/lib/resume/schema";

const patchInput = z.object({
  revision: z.number().int().min(1),
  content: resumeContent.optional(),
  settings: resumeSettings.optional(),
  templateId: z.enum(TEMPLATES).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  experienceLevel: experienceLevel.optional(),
  lastScore: z.number().int().min(0).max(100).optional(),
});

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/resumes/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const resume = await repo.getResume(user.id, id);
  if (!resume) throw new NotFoundError("resume_not_found");
  return Response.json({ resume, target: await repo.getTarget(user.id, id) });
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/resumes/[id]">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  const { revision, ...patch } = await body(req, patchInput);
  const r = await repo.updateResume(user.id, id, revision, patch);
  return Response.json({ revision: r.revision, updatedAt: r.updatedAt });
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/resumes/[id]">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  await repo.deleteResume(user.id, id);
  return new Response(null, { status: 204 });
});
