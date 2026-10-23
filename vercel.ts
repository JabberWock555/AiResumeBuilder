import type { VercelConfig } from "@vercel/config/v1";

// Scheduled jobs (src/server/jobs.ts). Times are UTC. Vercel sends
// `Authorization: Bearer $CRON_SECRET` with each call.
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    { path: "/api/cron/cleanup-imports", schedule: "0 * * * *" },
    { path: "/api/cron/prune-versions", schedule: "0 3 * * *" },
    { path: "/api/cron/reconcile-billing", schedule: "0 4 * * *" },
    { path: "/api/cron/prune-logs", schedule: "0 5 * * 0" },
  ],
};
