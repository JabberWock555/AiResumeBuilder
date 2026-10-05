import { z } from "zod";
import { repo } from "@/server/repo";
import { NotFoundError } from "@/server/errors";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { withCredit } from "@/server/ai";
import { writeBullet } from "@/lib/ai/demo";
import type { ExperienceEntry } from "@/lib/resume/schema";

const input = z.object({
  resumeId: z.string(),
  entryId: z.string(),
  bulletId: z.string().optional(),
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
  const out = await withCredit(user.id, resume.id, `bullet_${i.mode}`, () =>
    writeBullet({ mode: i.mode, text: i.text, role: entry?.role ?? "", company: entry?.company ?? "" }),
  );
  return Response.json(out);
});
