import "server-only";
import { DEFAULT_SETTINGS, blankContent, type ResumeContent, type ResumeSettings } from "@/lib/resume/schema";
import { ConflictError, NotFoundError } from "../errors";
import { adminClient, clientFor, fail, sessionClaims, userClient } from "../supabase";
import { periodKey } from "./limits";
import type { BillingStore, Ops, Plan, QuotaKind, Repo, Resume, ResumeSummary, Subscription, TargetJob, Usage, User } from "./types";

// Supabase implementation of the data layer. User actions run on the user's
// own client (clientFor), so row level security applies to every query; the
// explicit user_id filters are a second lock on the same door. Service-role
// calls (adminClient) are limited to what a user must not do themselves.

type ResumeRow = {
  id: string; user_id: string; folder_id: string | null; name: string; experience_level: Resume["experienceLevel"];
  language: string; template_id: Resume["templateId"]; settings: Partial<ResumeSettings>; content: ResumeContent;
  revision: number; source: Resume["source"]; last_score: number | null; created_at: string; updated_at: string;
  target_jobs?: { id: string } | { id: string }[] | null;
};
type TargetRow = {
  resume_id: string; title: string; company: string | null; description: string; keywords: TargetJob["keywords"];
  dismissed: string[]; extracted_at: string | null; extraction_model: string | null;
};
type SubRow = {
  user_id: string; kind: Subscription["kind"]; status: Subscription["status"]; stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null; stripe_price_id: string | null;
  amount_cents: number; currency: string; current_period_end: string | null; cancel_at_period_end: boolean;
};

const toResume = (r: ResumeRow): Resume => ({
  id: r.id,
  userId: r.user_id,
  folderId: r.folder_id,
  name: r.name,
  experienceLevel: r.experience_level,
  language: r.language,
  templateId: r.template_id,
  settings: { ...DEFAULT_SETTINGS, ...r.settings },
  content: r.content,
  revision: r.revision,
  source: r.source,
  lastScore: r.last_score,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toTarget = (t: TargetRow): TargetJob => ({
  resumeId: t.resume_id,
  title: t.title,
  company: t.company ?? "",
  description: t.description,
  keywords: t.keywords,
  dismissed: t.dismissed,
  extractedAt: t.extracted_at,
  extractionModel: t.extraction_model,
});

const toSub = (s: SubRow): Subscription => ({
  kind: s.kind,
  status: s.status,
  stripeSubscriptionId: s.stripe_subscription_id,
  stripeCheckoutSessionId: s.stripe_checkout_session_id,
  stripePaymentIntentId: s.stripe_payment_intent_id,
  stripePriceId: s.stripe_price_id,
  amountCents: s.amount_cents,
  currency: s.currency,
  currentPeriodEnd: s.current_period_end,
  cancelAtPeriodEnd: s.cancel_at_period_end,
});

async function getResumeWith(sb: Awaited<ReturnType<typeof clientFor>>, userId: string, id: string) {
  if (!isUuid(id)) return null;
  const { data, error } = await sb.from("resumes").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) fail(error);
  return data ? toResume(data as ResumeRow) : null;
}

/** Ids come from URLs; Postgres rejects a malformed uuid with an error, so treat it as "not found". */
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const supabaseRepo: Repo = {
  async getUser(userId) {
    const sb = await userClient();
    const claims = await sessionClaims(sb);
    const own = claims?.sub === userId;
    const db = own ? sb : adminClient();
    const { data, error } = await db
      .from("profiles")
      .select("id, full_name, plan, theme, app_language, onboarding, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) fail(error);
    if (!data) return null;
    const email = own && claims?.email ? claims.email : (await adminClient().auth.admin.getUserById(userId)).data.user?.email;
    return {
      id: data.id,
      email: (email ?? "").toLowerCase(),
      fullName: data.full_name ?? "",
      plan: data.plan,
      theme: data.theme,
      appLanguage: data.app_language,
      onboarding: data.onboarding ?? {},
      createdAt: data.created_at,
    } satisfies User;
  },

  async updateUser(userId, patch) {
    const sb = await clientFor(userId);
    const row: Record<string, unknown> = {};
    if (patch.fullName !== undefined) row.full_name = patch.fullName;
    if (patch.theme !== undefined) row.theme = patch.theme;
    if (patch.appLanguage !== undefined) row.app_language = patch.appLanguage;
    if (patch.onboarding !== undefined) row.onboarding = patch.onboarding;
    const { error } = await sb.from("profiles").update(row).eq("id", userId);
    if (error) fail(error);
    const u = await supabaseRepo.getUser(userId);
    if (!u) throw new NotFoundError("user_not_found");
    return u;
  },

  async usage(userId) {
    const sb = await clientFor(userId);
    const [profile, limits, counters, count] = await Promise.all([
      sb.from("profiles").select("plan").eq("id", userId).single(),
      sb.from("plan_limits").select("plan, kind, max_uses, period_type"),
      sb.from("usage_counters").select("period, kind, used").eq("user_id", userId),
      sb.from("resumes").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    for (const r of [profile, limits, counters, count]) if (r.error) fail(r.error);
    const plan = profile.data!.plan as Plan;
    const out = {} as Usage;
    for (const l of limits.data!.filter((x) => x.plan === plan)) {
      const kind = l.kind as keyof Usage;
      const used =
        kind === "resume"
          ? (count.count ?? 0)
          : (counters.data!.find((c) => c.kind === kind && c.period === periodKey(l.period_type))?.used ?? 0);
      out[kind] = { used, max: l.max_uses };
    }
    return out;
  },

  async consumeQuota(userId, kind) {
    const sb = await clientFor(userId);
    const { data, error } = await sb.rpc("consume_quota", { p_kind: kind });
    if (error) fail(error);
    return data as number | null;
  },

  async refundQuota(userId, kind: QuotaKind) {
    const { error } = await adminClient().rpc("refund_quota_now", { p_user: userId, p_kind: kind });
    if (error) fail(error);
  },

  async listResumes(userId, sort) {
    const sb = await clientFor(userId);
    const order = { created: ["created_at", false], updated: ["updated_at", false], name: ["name", true] } as const;
    const [col, asc] = order[sort];
    const { data, error } = await sb
      .from("resumes")
      .select("*, target_jobs(id)")
      .eq("user_id", userId)
      .order(col, { ascending: asc });
    if (error) fail(error);
    return (data as ResumeRow[]).map(
      (r): ResumeSummary => ({
        ...toResume(r),
        hasTarget: Array.isArray(r.target_jobs) ? r.target_jobs.length > 0 : Boolean(r.target_jobs),
      }),
    );
  },

  async getResume(userId, id) {
    return getResumeWith(await clientFor(userId), userId, id);
  },

  async getResumeForPrint(userId, id) {
    // The print page is authorised by a signed 60-second token naming both ids.
    return getResumeWith(adminClient(), userId, id);
  },

  async createResume(userId, input) {
    const sb = await clientFor(userId);
    const { data, error } = await sb
      .from("resumes")
      .insert({
        user_id: userId,
        name: input.name,
        experience_level: input.experienceLevel,
        language: input.language,
        settings: DEFAULT_SETTINGS,
        content: input.content ?? blankContent(),
        source: input.source ?? "scratch",
      })
      .select("*")
      .single();
    if (error) fail(error);
    return toResume(data as ResumeRow);
  },

  async updateResume(userId, id, revision, patch) {
    const sb = await clientFor(userId);
    const bump = patch.content !== undefined || patch.settings !== undefined || patch.templateId !== undefined || patch.name !== undefined;
    const row: Record<string, unknown> = {};
    if (patch.content !== undefined) row.content = patch.content;
    if (patch.settings !== undefined) row.settings = patch.settings;
    if (patch.templateId !== undefined) row.template_id = patch.templateId;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.folderId !== undefined) row.folder_id = patch.folderId;
    if (patch.lastScore !== undefined) row.last_score = patch.lastScore;
    if (patch.experienceLevel !== undefined) row.experience_level = patch.experienceLevel;
    if (bump) row.revision = revision + 1;
    // Optimistic concurrency: the update only matches the revision the editor had.
    const { data, error } = await sb
      .from("resumes")
      .update(row)
      .eq("id", id)
      .eq("user_id", userId)
      .eq("revision", revision)
      .select("*")
      .maybeSingle();
    if (error) fail(error);
    if (data) return toResume(data as ResumeRow);
    const current = await getResumeWith(sb, userId, id);
    if (!current) throw new NotFoundError("resume_not_found");
    throw new ConflictError(current);
  },

  async deleteResume(userId, id) {
    const sb = await clientFor(userId);
    const { data, error } = await sb.from("resumes").delete().eq("id", id).eq("user_id", userId).select("id");
    if (error) fail(error);
    if (!data.length) throw new NotFoundError("resume_not_found");
  },

  async duplicateResume(userId, id, name) {
    const sb = await clientFor(userId);
    const src = await getResumeWith(sb, userId, id);
    if (!src) throw new NotFoundError("resume_not_found");
    const { data, error } = await sb
      .from("resumes")
      .insert({
        user_id: userId,
        folder_id: src.folderId,
        name: name ?? `${src.name} (copy)`.slice(0, 120),
        experience_level: src.experienceLevel,
        language: src.language,
        template_id: src.templateId,
        settings: src.settings,
        content: src.content,
        source: "duplicate",
        last_score: src.lastScore,
      })
      .select("*")
      .single();
    if (error) fail(error);
    const copy = toResume(data as ResumeRow);
    const target = await supabaseRepo.getTarget(userId, id);
    if (target) {
      const { error: e2 } = await sb.from("target_jobs").insert({
        resume_id: copy.id, user_id: userId, title: target.title, company: target.company, description: target.description,
        keywords: target.keywords, dismissed: target.dismissed, extracted_at: target.extractedAt, extraction_model: target.extractionModel,
      });
      if (e2) fail(e2);
    }
    return copy;
  },

  async getTarget(userId, resumeId) {
    if (!isUuid(resumeId)) return null;
    const sb = await clientFor(userId);
    const { data, error } = await sb.from("target_jobs").select("*").eq("resume_id", resumeId).eq("user_id", userId).maybeSingle();
    if (error) fail(error);
    return data ? toTarget(data as TargetRow) : null;
  },

  async setTarget(userId, resumeId, t) {
    const sb = await clientFor(userId);
    const prev = await supabaseRepo.getTarget(userId, resumeId);
    const { data, error } = await sb
      .from("target_jobs")
      .upsert(
        {
          resume_id: resumeId, user_id: userId, title: t.title, company: t.company, description: t.description, keywords: t.keywords,
          // Keep the "not relevant" answers only if it's the same job ad.
          dismissed: prev && prev.description === t.description ? prev.dismissed : [],
          extracted_at: t.extractedAt, extraction_model: t.extractionModel,
        },
        { onConflict: "resume_id" },
      )
      .select("*")
      .single();
    if (error) fail(error);
    return toTarget(data as TargetRow);
  },

  async deleteTarget(userId, resumeId) {
    const sb = await clientFor(userId);
    if (!(await getResumeWith(sb, userId, resumeId))) throw new NotFoundError("resume_not_found");
    const { error } = await sb.from("target_jobs").delete().eq("resume_id", resumeId).eq("user_id", userId);
    if (error) fail(error);
  },

  async dismissKeyword(userId, resumeId, term, dismissed) {
    const sb = await clientFor(userId);
    const t = await supabaseRepo.getTarget(userId, resumeId);
    if (!t) throw new NotFoundError("target_not_found");
    const next = dismissed ? [...new Set([...t.dismissed, term])] : t.dismissed.filter((x) => x !== term);
    const { data, error } = await sb
      .from("target_jobs")
      .update({ dismissed: next })
      .eq("resume_id", resumeId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) fail(error);
    return toTarget(data as TargetRow);
  },

  async wasExported(userId, resumeId, format, revision) {
    const sb = await clientFor(userId);
    const { count, error } = await sb
      .from("exports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("resume_id", resumeId)
      .eq("format", format)
      .eq("revision", revision);
    if (error) fail(error);
    return (count ?? 0) > 0;
  },

  async recordExport(userId, resumeId, format, revision, templateId) {
    const sb = await clientFor(userId);
    const { data, error } = await sb.rpc("record_export", {
      p_resume: resumeId, p_format: format, p_revision: revision, p_template: templateId,
    });
    if (error) fail(error);
    return { fresh: Boolean(data) };
  },

  async logAi(userId, e) {
    // ai_generations has no insert policy for users: the server writes the log.
    const { error } = await adminClient().from("ai_generations").insert({
      user_id: userId, resume_id: e.resumeId, kind: e.kind, model: e.model, counted: e.counted, status: e.status,
      input_tokens: e.inputTokens ?? null, output_tokens: e.outputTokens ?? null,
    });
    if (error) console.error(`ai log: ${error.message}`);
  },
};

// ---------------------------------------------------------------------------
// billing (service role: only the Stripe webhook, checkout and reconcile job)

export const supabaseBilling: BillingStore = {
  async account(userId) {
    const db = adminClient();
    const [p, s] = await Promise.all([
      db.from("profiles").select("plan, stripe_customer_id").eq("id", userId).single(),
      db.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    if (p.error) fail(p.error);
    if (s.error) fail(s.error);
    return { plan: p.data.plan, stripeCustomerId: p.data.stripe_customer_id, subscriptions: (s.data as SubRow[]).map(toSub) };
  },

  async setCustomer(userId, customerId) {
    const { error } = await adminClient().from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
    if (error) fail(error);
  },

  async userByCustomer(customerId) {
    const { data, error } = await adminClient().from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    if (error) fail(error);
    return data?.id ?? null;
  },

  async claimEvent(id, type) {
    const db = adminClient();
    const { error } = await db.from("stripe_events").insert({ id, type });
    if (!error) return "new";
    if (error.code !== "23505") fail(error);
    const { data, error: e2 } = await db.from("stripe_events").select("processed_at").eq("id", id).single();
    if (e2) fail(e2);
    return data.processed_at ? "done" : "retry";
  },

  async finishEvent(id) {
    const { error } = await adminClient().from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
    if (error) fail(error);
  },

  async upsertSubscription(userId, s) {
    const db = adminClient();
    const row = {
      user_id: userId, kind: s.kind, status: s.status, stripe_subscription_id: s.stripeSubscriptionId,
      stripe_payment_intent_id: s.stripePaymentIntentId, stripe_price_id: s.stripePriceId, amount_cents: s.amountCents,
      currency: s.currency, current_period_end: s.currentPeriodEnd, cancel_at_period_end: s.cancelAtPeriodEnd,
      ...(s.stripeCheckoutSessionId ? { stripe_checkout_session_id: s.stripeCheckoutSessionId } : {}),
    };
    const { error } = await db
      .from("subscriptions")
      .upsert(row, { onConflict: s.stripeSubscriptionId ? "stripe_subscription_id" : "stripe_checkout_session_id" });
    if (error) fail(error);
    const { data, error: e2 } = await db.rpc("sync_plan", { p_user: userId });
    if (e2) fail(e2);
    return data as Plan;
  },

  async refundLifetime(paymentIntentId) {
    const db = adminClient();
    const { data, error } = await db
      .from("subscriptions")
      .update({ status: "refunded" })
      .eq("kind", "lifetime")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .select("user_id")
      .maybeSingle();
    if (error) fail(error);
    if (!data) return null;
    const { error: e2 } = await db.rpc("sync_plan", { p_user: data.user_id });
    if (e2) fail(e2);
    return data.user_id as string;
  },
};

// ---------------------------------------------------------------------------
// ops (service role)

export const supabaseOps: Ops = {
  async rateLimit(key, max, windowSeconds) {
    const { data, error } = await adminClient().rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) fail(error);
    return Boolean(data);
  },
  async aiCallsSince(userId, since) {
    const { count, error } = await adminClient()
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (error) fail(error);
    return count ?? 0;
  },
  async recordJob(run) {
    const { error } = await adminClient().from("job_runs").insert({
      job: run.job, status: run.status, attempts: run.attempts, result: run.result ?? null, error: run.error ?? null,
      started_at: run.startedAt.toISOString(),
    });
    if (error) console.error(`job log: ${error.message}`);
  },
  async pruneVersions() {
    const { data, error } = await adminClient().rpc("prune_versions");
    if (error) fail(error);
    return data as number;
  },
  async pruneAiLogs() {
    const { data, error } = await adminClient().rpc("prune_ai_logs");
    if (error) fail(error);
    return data as number;
  },
  async pruneHousekeeping() {
    const { data, error } = await adminClient().rpc("prune_housekeeping");
    if (error) fail(error);
    return data;
  },
};
