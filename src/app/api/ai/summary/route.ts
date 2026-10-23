import { z } from "zod";
import { repo } from "@/server/repo";
import { NotFoundError } from "@/server/errors";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { withCredit } from "@/server/ai/credit";
import { writeSummary } from "@/server/ai/writer";
import { allText, type ExperienceEntry } from "@/lib/resume/schema";

export const maxDuration = 30;

const input = z.object({
  resumeId: z.string().max(64),
  position: z.string().trim().max(120),
  skills: z.array(z.string().max(60)).max(20),
});

/** Whole years between the earliest start and the latest end in Experience. */
function yearsOfExperience(entries: ExperienceEntry[]) {
  const now = new Date();
  const toM = (v: { year: number; month: number }) => v.year * 12 + v.month - 1;
  const spans = entries
    .filter((e) => e.start)
    .map((e) => [toM(e.start!), e.end === "present" || !e.end ? now.getFullYear() * 12 + now.getMonth() : toM(e.end)] as const);
  if (!spans.length) return null;
  return Math.floor((Math.max(...spans.map((s) => s[1])) - Math.min(...spans.map((s) => s[0]))) / 12);
}

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const i = await body(req, input);
  const resume = await repo.getResume(user.id, i.resumeId);
  if (!resume) throw new NotFoundError("resume_not_found");
  const exp = resume.content.sections.find((s) => s.type === "experience")?.entries as ExperienceEntry[] | undefined;
  const out = await withCredit(user.id, resume.id, "summary", () =>
    writeSummary({
      position: i.position,
      skills: i.skills,
      years: yearsOfExperience(exp ?? []),
      level: resume.experienceLevel,
      roles: (exp ?? []).filter((e) => e.role).map((e) => (e.company ? `${e.role} at ${e.company}` : e.role)),
      source: `${allText(resume.content)} ${i.skills.join(" ")}`,
    }),
  );
  return Response.json(out);
});
