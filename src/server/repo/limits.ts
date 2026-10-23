import type { Plan, QuotaKind } from "./types";

// Mirrors the plan_limits rows in supabase/migrations/0001_init.sql. Keep the two in step.
export const PLAN_LIMITS: Record<Plan, Record<"resume" | QuotaKind, { max: number | null; period: "count" | "lifetime" | "month" }>> = {
  free: {
    resume: { max: 1, period: "count" },
    ai_generation: { max: 10, period: "lifetime" },
    pdf_download: { max: 3, period: "lifetime" },
    docx_download: { max: 0, period: "lifetime" },
    import: { max: 3, period: "lifetime" },
  },
  pro: {
    resume: { max: null, period: "count" },
    ai_generation: { max: 300, period: "month" },
    pdf_download: { max: null, period: "month" },
    docx_download: { max: null, period: "month" },
    import: { max: 30, period: "month" },
  },
  lifetime: {
    resume: { max: null, period: "count" },
    ai_generation: { max: 300, period: "month" },
    pdf_download: { max: null, period: "month" },
    docx_download: { max: null, period: "month" },
    import: { max: 30, period: "month" },
  },
};

export function periodKey(period: "count" | "lifetime" | "month", now = new Date()) {
  return period === "month" ? now.toISOString().slice(0, 7) : "lifetime";
}
