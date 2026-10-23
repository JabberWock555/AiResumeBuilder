import "server-only";
import { config } from "../config";
import { repo } from "../repo";
import { limit, perKey } from "../rate-limit";
import { extractJobKeywords } from "./writer";

/**
 * Keywords for a job ad. Free (no credit), but limited to 10 model calls an
 * hour per user; the rule-based fallback has no limit.
 */
export async function keywordsForTarget(userId: string, resumeId: string | null, description: string) {
  if (config.ai) await limit(perKey("keywords", userId, 10, 3600));
  const r = await extractJobKeywords(description);
  if (r.model !== "rules")
    await repo.logAi(userId, {
      resumeId, kind: "keyword_extract", model: r.model, counted: false, status: "ok",
      inputTokens: r.inputTokens, outputTokens: r.outputTokens,
    });
  return { keywords: r.keywords, extractedAt: new Date().toISOString(), extractionModel: r.model };
}
