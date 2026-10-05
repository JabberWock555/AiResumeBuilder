import { z } from "zod";
import { repo } from "@/server/repo";
import { NotFoundError } from "@/server/errors";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { withCredit } from "@/server/ai";
import { writeKeywordBullet } from "@/lib/ai/demo";
import type { ExperienceEntry } from "@/lib/resume/schema";

const input = z.object({ resumeId: z.string(), term: z.string().min(1).max(80), entryId: z.string().optional() });

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const i = await body(req, input);
  const resume = await repo.getResume(user.id, i.resumeId);
  if (!resume) throw new NotFoundError("resume_not_found");
  const roles = resume.content.sections
    .filter((s) => s.type === "experience" || s.type === "projects")
    .flatMap((s) => s.entries as ExperienceEntry[])
    .filter((e) => e.role || e.company);
  if (!roles.length) return Response.json({ error: "no_roles" }, { status: 400 });
  // Default to the most recent role; the user can move it.
  const entry = roles.find((e) => e.id === i.entryId) ?? roles[0];
  const out = await withCredit(user.id, resume.id, "keyword_bullet", () =>
    writeKeywordBullet({ term: i.term, role: entry.role, company: entry.company }),
  );
  return Response.json({ ...out, entryId: entry.id });
});
