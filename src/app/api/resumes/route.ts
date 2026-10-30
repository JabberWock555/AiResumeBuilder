import { z } from "zod";
import { repo } from "@/server/repo";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { blankContent, experienceLevel } from "@/lib/resume/schema";
import { keywordsForTarget } from "@/server/ai/keywords";

export const maxDuration = 30;

const createInput = z.object({
  /** Optional: made from the job ("Priya Raman – Data Analyst at Fernway") when left out. */
  name: z.string().trim().min(1).max(120).optional(),
  /** Optional: taken from the profile when left out. */
  experienceLevel: experienceLevel.optional(),
  /** Start from the saved profile (default when there is one) or blank. */
  from: z.enum(["profile", "blank"]).optional(),
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
  const profile = await repo.getProfile(user.id);
  const useProfile = input.from !== "blank" && Boolean(profile.content);
  // A blank resume still starts with the account's name and email.
  const content = useProfile ? profile.content! : blankContent();
  if (!useProfile) {
    content.contact.fullName = user.fullName;
    content.contact.email = user.email;
  }
  const who = content.contact.fullName || user.fullName;
  const job = input.target ? `${input.target.title}${input.target.company ? ` at ${input.target.company}` : ""}` : "";
  const name = (input.name ?? ([who, job].filter(Boolean).join(" – ") || "My resume")).slice(0, 120);
  const resume = await repo.createResume(user.id, {
    name,
    experienceLevel: input.experienceLevel ?? profile.experienceLevel ?? "entry",
    language: input.language,
    content,
    source: useProfile ? "duplicate" : "scratch",
  });
  if (input.target) {
    await repo.setTarget(user.id, resume.id, { ...input.target, ...(await keywordsForTarget(user.id, resume.id, input.target.description)) });
  }
  return Response.json({ id: resume.id }, { status: 201 });
});
