import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { experienceLevel } from "@/lib/resume/schema";
import { keywordsForTarget } from "@/server/ai/keywords";

export const maxDuration = 30;

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  experienceLevel,
  language: z.string().max(10).default("en-US"),
  target: z
    .object({
      title: z.string().trim().min(1).max(120),
      company: z.string().trim().max(120).default(""),
      description: z.string().trim().min(50, "Paste the whole job ad (at least 50 characters)").max(20000),
    })
    .optional(),
});

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const sort = new URL(req.url).searchParams.get("sort");
  const resumes = await repo.listResumes(user.id, sort === "updated" || sort === "name" ? sort : "created");
  return Response.json({ resumes });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const input = await body(req, createInput);
  const resume = await repo.createResume(user.id, input);
  if (input.target) {
    await repo.setTarget(user.id, resume.id, { ...input.target, ...(await keywordsForTarget(user.id, resume.id, input.target.description)) });
  }
  return Response.json({ id: resume.id }, { status: 201 });
});
