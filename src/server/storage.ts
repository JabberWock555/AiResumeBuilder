import "server-only";
import { config } from "./config";
import { adminClient } from "./supabase";

/** Empties a user's folders in the private buckets (account deletion). */
export async function purgeUserFiles(userId: string) {
  if (config.backend !== "supabase") return;
  const storage = adminClient().storage;
  for (const bucket of ["imports", "photos"]) {
    for (;;) {
      const { data, error } = await storage.from(bucket).list(userId, { limit: 100 });
      if (error) throw error;
      if (!data.length) break;
      const { error: e2 } = await storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`));
      if (e2) throw e2;
    }
  }
}
