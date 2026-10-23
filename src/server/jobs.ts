import "server-only";
import { timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { auth, billingStore, ops } from "./repo";
import { appUrl, config } from "./config";
import { adminClient } from "./supabase";
import { sendEmail } from "./email";
import { emails } from "./email-templates";
import { HANDLED_EVENTS, processEvent } from "./billing/events";
import { billingDeps, stripe } from "./billing/stripe";

// Scheduled jobs, run by Vercel Cron (vercel.ts) as GET /api/cron/<name>.
// Each run gets 3 attempts with a short backoff; a run that still fails is
// stored in job_runs as "dead" with its error (the dead-letter log), and the
// next scheduled run tries again. Schedules are in UTC.

export const JOBS = {
  /** Daily 03:00. Keep the last 50 versions per resume plus the last 7 days. */
  "prune-versions": async () => ({ deleted: await ops.pruneVersions() }),

  /** Hourly. Delete uploaded resume files once parsed or after 24 hours. */
  "cleanup-imports": async () => {
    if (config.backend !== "supabase") return { deleted: 0 };
    const db = adminClient();
    const cutoff = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { data, error } = await db
      .from("imports")
      .select("id, storage_path")
      .is("file_deleted_at", null)
      .or(`status.eq.parsed,status.eq.failed,created_at.lt.${cutoff}`)
      .limit(500);
    if (error) throw error;
    if (!data.length) return { deleted: 0 };
    const { error: e2 } = await db.storage.from("imports").remove(data.map((r) => r.storage_path.replace(/^imports\//, "")));
    if (e2) throw e2;
    const { error: e3 } = await db.from("imports").update({ file_deleted_at: new Date().toISOString() }).in("id", data.map((r) => r.id));
    if (e3) throw e3;
    return { deleted: data.length };
  },

  /**
   * Daily 04:00. Replays the last 48 hours of Stripe events through the same
   * handler as the webhook. Already-processed events are skipped, so this only
   * fixes what a missed or failed webhook left behind.
   */
  "reconcile-billing": async () => {
    if (!config.billing) return { skipped: "billing off" };
    const deps = billingDeps(async (userId) => {
      const to = await auth.emailOf(userId);
      if (to) await sendEmail(emails.paymentFailed(to, `${appUrl()}/app/settings#billing`));
    });
    const counts: Record<string, number> = {};
    const since = Math.floor(Date.now() / 1000) - 48 * 3600;
    for await (const event of stripe().events.list({ created: { gte: since }, types: [...HANDLED_EVENTS], limit: 100 })) {
      const r = await processEvent(event as Stripe.Event, billingStore, deps);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    return counts;
  },

  /** Weekly, Sunday 05:00. AI call logs older than 180 days, plus old rate-limit windows and events. */
  "prune-logs": async () => ({ aiLogs: await ops.pruneAiLogs(), housekeeping: await ops.pruneHousekeeping() }),
} satisfies Record<string, () => Promise<unknown>>;

export type JobName = keyof typeof JOBS;

export async function runJob(name: JobName) {
  const startedAt = new Date();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await JOBS[name]();
      await ops.recordJob({ job: name, status: "ok", attempts: attempt, result, startedAt });
      return { ok: true as const, attempts: attempt, result };
    } catch (e) {
      lastError = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  const error = lastError instanceof Error ? lastError.message : String(lastError);
  await ops.recordJob({ job: name, status: "dead", attempts: 3, error: error.slice(0, 2000), startedAt });
  console.error(`job ${name} failed after 3 attempts: ${error}`);
  return { ok: false as const, attempts: 3, error };
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
