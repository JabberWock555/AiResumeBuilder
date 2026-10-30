import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { experienceLevel, resumeContent } from "@/lib/resume/schema";

/** The saved profile: entered once, copied into each new resume. */
export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ profile: await repo.getProfile(user.id) });
});

const patch = z.object({
  revision: z.number().int().min(0),
  content: resumeContent.optional(),
  experienceLevel: experienceLevel.optional(),
});

/** Autosave. 409 with the saved copy when another tab changed it first. */
export const PATCH = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { revision, ...p } = await body(req, patch);
  const saved = await repo.saveProfile(user.id, revision, p);
  return Response.json({ revision: saved.revision, updatedAt: saved.updatedAt });
});
