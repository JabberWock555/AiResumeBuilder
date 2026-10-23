import { z } from "zod";
import { repo } from "@/server/repo";
import { NotFoundError } from "@/server/errors";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { withCredit } from "@/server/ai/credit";
import { writeBullet } from "@/server/ai/writer";
import { allText, type ExperienceEntry } from "@/lib/resume/schema";

export const maxDuration = 30;

const input = z.object({
  resumeId: z.string().max(64),
  entryId: z.string().max(64),
  bulletId: z.string().max(64).optional(),
  /** The bullet as it is in the editor right now (may be ahead of the saved copy). */
  text: z.string().max(600).default(""),
  mode: z.enum(["suggest", "complete", "quantify", "rewrite"]),
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const i = await body(req, input);
  const resume = await repo.getResume(user.id, i.resumeId);
  if (!resume) throw new NotFoundError("resume_not_found");
  const entry = resume.content.sections
    .flatMap((s) => s.entries as ExperienceEntry[])
    .find((e) => e.id === i.entryId);
  const target = await repo.getTarget(user.id, resume.id);
  const out = await withCredit(user.id, resume.id, `bullet_${i.mode}`, () =>
    writeBullet({
      mode: i.mode,
      text: i.text,
      role: entry?.role ?? "",
      company: entry?.company ?? "",
      otherBullets: (entry?.bullets ?? []).filter((b) => b.id !== i.bulletId && b.text.trim()).map((b) => b.text),
      level: resume.experienceLevel,
      targetTitle: target?.title,
      // Facts the AI may use: everything the user has written, including the unsaved draft.
      source: `${allText(resume.content)} ${i.text}`,
    }),
  );
  return Response.json(out);
});
