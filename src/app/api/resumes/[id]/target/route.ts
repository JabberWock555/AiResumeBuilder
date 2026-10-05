import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { extractKeywords } from "@/lib/score/keywords";

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
  // Rule-based extraction for now; /replica-backend switches this to the AI extractor.
  const target = await repo.setTarget(user.id, id, {
    ...t,
    keywords: extractKeywords(t.description),
    extractedAt: new Date().toISOString(),
    extractionModel: "rules",
  });
  return Response.json({ target });
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/resumes/[id]/target">) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { id } = await ctx.params;
  await repo.deleteTarget(user.id, id);
  return new Response(null, { status: 204 });
});
