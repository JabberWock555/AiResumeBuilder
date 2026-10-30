import "server-only";
import { repo } from "./repo";
import { blankContent, type ExperienceLevel, type ResumeContent } from "@/lib/resume/schema";

/**
 * The document an editor works on: a resume by id, or the saved profile
 * ("profile"), so the section forms and the AI writer work the same in both.
 */
export async function docFor(userId: string, resumeId: string): Promise<{ id: string | null; content: ResumeContent; experienceLevel: ExperienceLevel } | null> {
  if (resumeId === "profile") {
    const p = await repo.getProfile(userId);
    return { id: null, content: p.content ?? blankContent(), experienceLevel: p.experienceLevel ?? "entry" };
  }
  const r = await repo.getResume(userId, resumeId);
  return r && { id: r.id, content: r.content, experienceLevel: r.experienceLevel };
}
