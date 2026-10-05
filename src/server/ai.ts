import "server-only";
import { repo } from "./repo";
import { QuotaError } from "./errors";

/**
 * Spend one AI credit, run the writer, and give the credit back if it fails.
 * The writer is the demo one until /replica-backend connects a model.
 */
export async function withCredit<T extends { model: string }>(
  userId: string,
  resumeId: string | null,
  kind: string,
  run: () => Promise<T> | T,
): Promise<T & { creditsLeft: number | null }> {
  const creditsLeft = await repo.consumeQuota(userId, "ai_generation");
  try {
    const result = await run();
    await repo.logAi(userId, { resumeId, kind, model: result.model, counted: true, status: "ok" });
    return { ...result, creditsLeft };
  } catch (e) {
    if (!(e instanceof QuotaError)) {
      await repo.refundQuota(userId, "ai_generation");
      await repo.logAi(userId, { resumeId, kind, model: "unknown", counted: false, status: "refunded" });
    }
    throw e;
  }
}
