// The data layer's contract. Screens and routes only talk to this.
// Two implementations: Supabase (supabase.ts, supabase/migrations) when its
// keys are set, and a local JSON file (fake.ts) for development without keys.

import type { Keyword } from "@/lib/score/keywords";
import type { ExperienceLevel, ResumeContent, ResumeSettings, TemplateId } from "@/lib/resume/schema";

export type Plan = "free" | "pro" | "lifetime";
export type QuotaKind = "ai_generation" | "pdf_download" | "docx_download" | "import";
export type Theme = "system" | "light" | "dark";

export type User = {
  id: string;
  email: string;
  fullName: string;
  plan: Plan;
  theme: Theme;
  appLanguage: string;
  onboarding: Record<string, string>;
  createdAt: string;
};

export type Resume = {
  id: string;
  userId: string;
  folderId: string | null;
  name: string;
  experienceLevel: ExperienceLevel;
  language: string;
  templateId: TemplateId;
  settings: ResumeSettings;
  content: ResumeContent;
  revision: number;
  source: "scratch" | "import" | "duplicate" | "linkedin_pdf" | "agent";
  lastScore: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ResumeSummary = Omit<Resume, "content" | "settings"> & {
  /** Enough to draw the card's thumbnail. */
  content: ResumeContent;
  settings: ResumeSettings;
  hasTarget: boolean;
};

export type TargetJob = {
  resumeId: string;
  title: string;
  company: string;
  description: string;
  keywords: Keyword[];
  dismissed: string[];
  extractedAt: string | null;
  extractionModel: string | null;
};

export type Usage = Record<"resume" | QuotaKind, { used: number; max: number | null }>;

export type ResumePatch = Partial<Pick<Resume, "content" | "settings" | "templateId" | "name" | "folderId" | "lastScore" | "experienceLevel">>;

export interface Repo {
  getUser(userId: string): Promise<User | null>;
  updateUser(userId: string, patch: Partial<Pick<User, "fullName" | "theme" | "appLanguage" | "onboarding">>): Promise<User>;

  usage(userId: string): Promise<Usage>;
  /** Spends one unit; returns units left (null = unlimited). Throws QuotaError. */
  consumeQuota(userId: string, kind: QuotaKind): Promise<number | null>;
  refundQuota(userId: string, kind: QuotaKind): Promise<void>;

  listResumes(userId: string, sort: "created" | "updated" | "name"): Promise<ResumeSummary[]>;
  getResume(userId: string, id: string): Promise<Resume | null>;
  /** For the print page, which has a signed token instead of a session. */
  getResumeForPrint(userId: string, id: string): Promise<Resume | null>;
  createResume(
    userId: string,
    input: { name: string; experienceLevel: ExperienceLevel; language: string; content?: ResumeContent; source?: Resume["source"] },
  ): Promise<Resume>;
  /** Throws ConflictError when `revision` is stale. */
  updateResume(userId: string, id: string, revision: number, patch: ResumePatch): Promise<Resume>;
  deleteResume(userId: string, id: string): Promise<void>;
  duplicateResume(userId: string, id: string, name?: string): Promise<Resume>;

  getTarget(userId: string, resumeId: string): Promise<TargetJob | null>;
  setTarget(userId: string, resumeId: string, t: Omit<TargetJob, "resumeId" | "dismissed">): Promise<TargetJob>;
  deleteTarget(userId: string, resumeId: string): Promise<void>;
  dismissKeyword(userId: string, resumeId: string, term: string, dismissed: boolean): Promise<TargetJob>;

  /** Records an export. `fresh` is false when this exact revision was exported before. */
  recordExport(userId: string, resumeId: string, format: "pdf" | "docx", revision: number, templateId: string): Promise<{ fresh: boolean }>;
  wasExported(userId: string, resumeId: string, format: "pdf" | "docx", revision: number): Promise<boolean>;
  logAi(userId: string, entry: AiLog): Promise<void>;
}

export type AiLog = {
  resumeId: string | null;
  kind: string;
  model: string;
  counted: boolean;
  status: "ok" | "error" | "refunded";
  inputTokens?: number;
  outputTokens?: number;
};

export type Subscription = {
  kind: "month" | "quarter" | "lifetime";
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid" | "refunded";
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripePriceId: string | null;
  amountCents: number;
  currency: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/** Billing state, written only by the Stripe webhook and the reconcile job. */
export interface BillingStore {
  account(userId: string): Promise<{ plan: Plan; stripeCustomerId: string | null; subscriptions: Subscription[] }>;
  setCustomer(userId: string, customerId: string): Promise<void>;
  userByCustomer(customerId: string): Promise<string | null>;
  /** Records a webhook event id. "done" means it was already processed: skip it. */
  claimEvent(id: string, type: string): Promise<"new" | "retry" | "done">;
  finishEvent(id: string): Promise<void>;
  /** Inserts or updates by Stripe id, then recomputes the user's plan and returns it. */
  upsertSubscription(userId: string, s: Subscription): Promise<Plan>;
  /** Marks a lifetime purchase refunded; returns the user id, if any. */
  refundLifetime(paymentIntentId: string): Promise<string | null>;
}

/** Rate limits, AI call counts and the scheduled jobs. */
export interface Ops {
  /** Counts one hit; false when over `max` in the current window. */
  rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  aiCallsSince(userId: string, since: Date): Promise<number>;
  recordJob(run: { job: string; status: "ok" | "dead"; attempts: number; result?: unknown; error?: string; startedAt: Date }): Promise<void>;
  pruneVersions(): Promise<number>;
  pruneAiLogs(): Promise<number>;
  pruneHousekeeping(): Promise<unknown>;
}
