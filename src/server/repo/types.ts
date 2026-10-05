// The data layer's contract. Screens and routes only talk to this.
// Today it's backed by a local JSON file (fake.ts). /replica-backend swaps in
// Supabase behind the same signatures (replica/schema.sql), so no screen changes.

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
  deleteUser(userId: string): Promise<void>;

  usage(userId: string): Promise<Usage>;
  /** Spends one unit; returns units left (null = unlimited). Throws QuotaError. */
  consumeQuota(userId: string, kind: QuotaKind): Promise<number | null>;
  refundQuota(userId: string, kind: QuotaKind): Promise<void>;

  listResumes(userId: string, sort: "created" | "updated" | "name"): Promise<ResumeSummary[]>;
  getResume(userId: string, id: string): Promise<Resume | null>;
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
  logAi(userId: string, entry: { resumeId: string | null; kind: string; model: string; counted: boolean; status: "ok" | "error" | "refunded" }): Promise<void>;
}

/** Dev-only auth, replaced by Supabase Auth in /replica-backend. */
export interface AuthStore {
  createUser(email: string, password: string, fullName: string): Promise<User>;
  verifyPassword(email: string, password: string): Promise<User | null>;
  createSession(userId: string): Promise<{ token: string; expiresAt: string }>;
  sessionUser(token: string): Promise<User | null>;
  deleteSession(token: string): Promise<void>;
  createResetToken(email: string): Promise<string | null>;
  resetPassword(token: string, password: string): Promise<boolean>;
}
