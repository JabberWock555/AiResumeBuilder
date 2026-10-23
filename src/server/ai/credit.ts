import "server-only";
import { ops, repo } from "../repo";
import { QuotaError, RateLimitError } from "../errors";

/**
 * Spend one AI credit, run the writer, and give the credit back if it fails.
 * Also caps bursts at 20 calls a minute per user, whatever the plan.
 */
export async function withCredit<T extends { model: string; inputTokens?: number; outputTokens?: number }>(
  userId: string,
  resumeId: string | null,
  kind: string,
  run: () => Promise<T> | T,
): Promise<Omit<T, "inputTokens" | "outputTokens"> & { creditsLeft: number | null }> {
  if ((await ops.aiCallsSince(userId, new Date(Date.now() - 60_000))) >= 20) throw new RateLimitError(60);
  const creditsLeft = await repo.consumeQuota(userId, "ai_generation");
  try {
    const { inputTokens, outputTokens, ...result } = await run();
    await repo.logAi(userId, { resumeId, kind, model: result.model, counted: true, status: "ok", inputTokens, outputTokens });
    return { ...result, creditsLeft };
  } catch (e) {
    if (!(e instanceof QuotaError)) {
      await repo.refundQuota(userId, "ai_generation");
      await repo.logAi(userId, { resumeId, kind, model: "unknown", counted: false, status: "refunded" });
    }
    throw e;
  }
}
