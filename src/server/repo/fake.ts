import "server-only";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { DEFAULT_SETTINGS, blankContent } from "@/lib/resume/schema";
import { AuthError, ConflictError, NotFoundError, QuotaError } from "../errors";
import { sendEmail } from "../email";
import { emails } from "../email-templates";
import type { AuthProvider, EmailLinkType } from "../auth/types";
import { PLAN_LIMITS, periodKey } from "./limits";
import type { AiLog, BillingStore, Ops, Plan, QuotaKind, Repo, Resume, Subscription, TargetJob, Usage, User } from "./types";

// A local JSON file standing in for Postgres and Supabase Auth when no
// Supabase keys are set. Every call reads the file and writes it back under
// one in-process lock, so it's slow and single-machine: development only.
// It follows the same rules as the database (quotas, plan sync, one export
// per revision) so the app behaves the same on both.

type FakeUser = User & {
  passwordHash: string;
  emailVerified: boolean;
  stripeCustomerId: string | null;
};
type Db = {
  users: FakeUser[];
  sessions: { token: string; userId: string; expiresAt: string }[];
  /** sha256 of the token from an emailed link. */
  emailTokens: { hash: string; userId: string; type: EmailLinkType; newEmail?: string; expiresAt: string }[];
  resumes: Resume[];
  targets: (TargetJob & { userId: string })[];
  usage: { userId: string; period: string; kind: QuotaKind; used: number }[];
  exports: { userId: string; resumeId: string; format: string; revision: number; templateId: string; createdAt: string }[];
  aiLogs: (AiLog & { userId: string; createdAt: string })[];
  subscriptions: (Subscription & { userId: string })[];
  stripeEvents: { id: string; type: string; processedAt: string | null }[];
  jobRuns: { job: string; status: string; attempts: number; error?: string; startedAt: string }[];
};

const FILE = path.join(process.cwd(), ".data", "db.json");
const empty = (): Db => ({
  users: [], sessions: [], emailTokens: [], resumes: [], targets: [], usage: [], exports: [], aiLogs: [],
  subscriptions: [], stripeEvents: [], jobRuns: [],
});

const g = globalThis as unknown as { __fakeDbLock?: Promise<unknown> };

async function load(): Promise<Db> {
  try {
    return { ...empty(), ...JSON.parse(await readFile(FILE, "utf8")) };
  } catch {
    return empty();
  }
}
async function save(db: Db) {
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 1));
  await rename(tmp, FILE);
}

/** Run fn with exclusive access to the db; saves when fn returns. */
function tx<T>(fn: (db: Db) => T | Promise<T>, write = true): Promise<T> {
  const run = (g.__fakeDbLock ?? Promise.resolve()).then(async () => {
    const db = await load();
    const result = await fn(db);
    if (write) await save(db);
    return result;
  });
  g.__fakeDbLock = run.catch(() => {});
  return run;
}
const read = <T,>(fn: (db: Db) => T | Promise<T>) => tx(fn, false);

const now = () => new Date().toISOString();
const clone = <T,>(x: T): T => structuredClone(x);
const publicUser = ({ id, email, fullName, plan, theme, appLanguage, onboarding, createdAt }: FakeUser): User =>
  clone({ id, email, fullName, plan, theme, appLanguage, onboarding, createdAt });

function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
function check(password: string, stored: string) {
  const [salt, h] = stored.split(":");
  const a = Buffer.from(h, "hex");
  const b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

function used(db: Db, userId: string, kind: QuotaKind) {
  const user = db.users.find((u) => u.id === userId)!;
  const lim = PLAN_LIMITS[user.plan][kind];
  const period = periodKey(lim.period);
  return { lim, period, row: db.usage.find((x) => x.userId === userId && x.kind === kind && x.period === period) };
}

function ownResume(db: Db, userId: string, id: string) {
  const r = db.resumes.find((x) => x.id === id && x.userId === userId);
  if (!r) throw new NotFoundError("resume_not_found");
  return r;
}

export const fakeRepo: Repo = {
  getUser: (userId) => read((db) => {
    const u = db.users.find((x) => x.id === userId);
    return u ? publicUser(u) : null;
  }),

  updateUser: (userId, patch) =>
    tx((db) => {
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new NotFoundError("user_not_found");
      Object.assign(u, patch);
      return publicUser(clone(u));
    }),

  usage: (userId) =>
    read((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new NotFoundError("user_not_found");
      const out = {} as Usage;
      out.resume = { used: db.resumes.filter((r) => r.userId === userId).length, max: PLAN_LIMITS[user.plan].resume.max };
      for (const kind of ["ai_generation", "pdf_download", "docx_download", "import"] as const) {
        const { lim, row } = used(db, userId, kind);
        out[kind] = { used: row?.used ?? 0, max: lim.max };
      }
      return out;
    }),

  consumeQuota: (userId, kind) =>
    tx((db) => {
      const { lim, period, row } = used(db, userId, kind);
      const r = row ?? (db.usage.push({ userId, kind, period, used: 0 }), db.usage.at(-1)!);
      if (lim.max !== null && r.used >= lim.max) throw new QuotaError(kind);
      r.used += 1;
      return lim.max === null ? null : lim.max - r.used;
    }),

  refundQuota: (userId, kind) =>
    tx((db) => {
      const { row } = used(db, userId, kind);
      if (row) row.used = Math.max(0, row.used - 1);
    }),

  listResumes: (userId, sort) =>
    read((db) => {
      const rows = db.resumes.filter((r) => r.userId === userId).map((r) => ({ ...clone(r), hasTarget: db.targets.some((t) => t.resumeId === r.id) }));
      const by = {
        created: (a: Resume, b: Resume) => b.createdAt.localeCompare(a.createdAt),
        updated: (a: Resume, b: Resume) => b.updatedAt.localeCompare(a.updatedAt),
        name: (a: Resume, b: Resume) => a.name.localeCompare(b.name),
      }[sort];
      return rows.sort(by);
    }),

  getResume: (userId, id) => read((db) => clone(db.resumes.find((r) => r.id === id && r.userId === userId) ?? null)),
  getResumeForPrint: (userId, id) => read((db) => clone(db.resumes.find((r) => r.id === id && r.userId === userId) ?? null)),

  createResume: (userId, input) =>
    tx((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new NotFoundError("user_not_found");
      const max = PLAN_LIMITS[user.plan].resume.max;
      if (max !== null && db.resumes.filter((r) => r.userId === userId).length >= max) throw new QuotaError("resume");
      const r: Resume = {
        id: randomUUID(),
        userId,
        folderId: null,
        name: input.name,
        experienceLevel: input.experienceLevel,
        language: input.language,
        templateId: "standard",
        settings: { ...DEFAULT_SETTINGS },
        content: input.content ?? blankContent(),
        revision: 1,
        source: input.source ?? "scratch",
        lastScore: null,
        createdAt: now(),
        updatedAt: now(),
      };
      db.resumes.push(r);
      return clone(r);
    }),

  updateResume: (userId, id, revision, patch) =>
    tx((db) => {
      const r = ownResume(db, userId, id);
      if (r.revision !== revision) throw new ConflictError(clone(r));
      const contentChanged = patch.content !== undefined || patch.settings !== undefined || patch.templateId !== undefined;
      Object.assign(r, patch);
      if (contentChanged || patch.name !== undefined) {
        r.revision += 1;
        r.updatedAt = now();
      }
      return clone(r);
    }),

  deleteResume: (userId, id) =>
    tx((db) => {
      ownResume(db, userId, id);
      db.resumes = db.resumes.filter((r) => r.id !== id);
      db.targets = db.targets.filter((t) => t.resumeId !== id);
      db.exports = db.exports.filter((e) => e.resumeId !== id);
    }),

  duplicateResume: (userId, id, name) =>
    tx((db) => {
      const src = ownResume(db, userId, id);
      const user = db.users.find((u) => u.id === userId)!;
      const max = PLAN_LIMITS[user.plan].resume.max;
      if (max !== null && db.resumes.filter((r) => r.userId === userId).length >= max) throw new QuotaError("resume");
      const copy: Resume = {
        ...clone(src),
        id: randomUUID(),
        name: name ?? `${src.name} (copy)`.slice(0, 120),
        revision: 1,
        source: "duplicate",
        createdAt: now(),
        updatedAt: now(),
      };
      db.resumes.push(copy);
      const t = db.targets.find((x) => x.resumeId === id);
      if (t) db.targets.push({ ...clone(t), resumeId: copy.id });
      return clone(copy);
    }),

  getTarget: (userId, resumeId) =>
    read((db) => {
      const t = db.targets.find((x) => x.resumeId === resumeId && x.userId === userId);
      if (!t) return null;
      const { userId: _u, ...rest } = clone(t);
      void _u;
      return rest;
    }),

  setTarget: (userId, resumeId, t) =>
    tx((db) => {
      ownResume(db, userId, resumeId);
      const prev = db.targets.find((x) => x.resumeId === resumeId);
      const row = { ...t, resumeId, userId, dismissed: prev && prev.description === t.description ? prev.dismissed : [] };
      db.targets = db.targets.filter((x) => x.resumeId !== resumeId);
      db.targets.push(row);
      const { userId: _u, ...rest } = clone(row);
      void _u;
      return rest;
    }),

  deleteTarget: (userId, resumeId) =>
    tx((db) => {
      ownResume(db, userId, resumeId);
      db.targets = db.targets.filter((x) => x.resumeId !== resumeId);
    }),

  dismissKeyword: (userId, resumeId, term, dismissed) =>
    tx((db) => {
      const t = db.targets.find((x) => x.resumeId === resumeId && x.userId === userId);
      if (!t) throw new NotFoundError("target_not_found");
      t.dismissed = dismissed ? [...new Set([...t.dismissed, term])] : t.dismissed.filter((x) => x !== term);
      const { userId: _u, ...rest } = clone(t);
      void _u;
      return rest;
    }),

  wasExported: (userId, resumeId, format, revision) =>
    read((db) => db.exports.some((e) => e.userId === userId && e.resumeId === resumeId && e.format === format && e.revision === revision)),

  recordExport: (userId, resumeId, format, revision, templateId) =>
    tx((db) => {
      const seen = db.exports.some((e) => e.resumeId === resumeId && e.format === format && e.revision === revision);
      if (!seen) db.exports.push({ userId, resumeId, format, revision, templateId, createdAt: now() });
      return { fresh: !seen };
    }),

  logAi: (userId, entry) =>
    tx((db) => {
      db.aiLogs.push({ ...entry, userId, createdAt: now() });
      if (db.aiLogs.length > 2000) db.aiLogs = db.aiLogs.slice(-2000);
    }),
};


// ---------------------------------------------------------------------------
// billing: same rules as sync_plan() in supabase/migrations/0002_backend.sql

function syncPlan(db: Db, userId: string): Plan {
  const subs = db.subscriptions.filter((s) => s.userId === userId);
  const plan: Plan = subs.some((s) => s.kind === "lifetime" && s.status === "active")
    ? "lifetime"
    : subs.some((s) => s.kind !== "lifetime" && ["active", "trialing", "past_due"].includes(s.status))
      ? "pro"
      : "free";
  const u = db.users.find((x) => x.id === userId);
  if (u) u.plan = plan;
  return plan;
}

export const fakeBilling: BillingStore = {
  account: (userId) =>
    read((db) => {
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new NotFoundError("user_not_found");
      return {
        plan: u.plan,
        stripeCustomerId: u.stripeCustomerId ?? null,
        subscriptions: clone(db.subscriptions.filter((s) => s.userId === userId).map(({ userId: _u, ...s }) => (void _u, s))),
      };
    }),

  setCustomer: (userId, customerId) =>
    tx((db) => {
      const u = db.users.find((x) => x.id === userId);
      if (u) u.stripeCustomerId = customerId;
    }),

  userByCustomer: (customerId) => read((db) => db.users.find((u) => u.stripeCustomerId === customerId)?.id ?? null),

  claimEvent: (id, type) =>
    tx((db) => {
      const e = db.stripeEvents.find((x) => x.id === id);
      if (!e) {
        db.stripeEvents.push({ id, type, processedAt: null });
        return "new" as const;
      }
      return e.processedAt ? ("done" as const) : ("retry" as const);
    }),

  finishEvent: (id) =>
    tx((db) => {
      const e = db.stripeEvents.find((x) => x.id === id);
      if (e) e.processedAt = now();
    }),

  upsertSubscription: (userId, s) =>
    tx((db) => {
      const same = (x: Subscription) =>
        (s.stripeSubscriptionId && x.stripeSubscriptionId === s.stripeSubscriptionId) ||
        (s.stripeCheckoutSessionId && x.stripeCheckoutSessionId === s.stripeCheckoutSessionId);
      const prev = db.subscriptions.find(same);
      if (prev) Object.assign(prev, { ...s, stripeCheckoutSessionId: s.stripeCheckoutSessionId ?? prev.stripeCheckoutSessionId });
      else db.subscriptions.push({ ...s, userId });
      return syncPlan(db, userId);
    }),

  refundLifetime: (paymentIntentId) =>
    tx((db) => {
      const s = db.subscriptions.find((x) => x.kind === "lifetime" && x.stripePaymentIntentId === paymentIntentId);
      if (!s) return null;
      s.status = "refunded";
      syncPlan(db, s.userId);
      return s.userId;
    }),
};

// ---------------------------------------------------------------------------
// ops: rate limits live in memory here (one process), in Postgres on Supabase

const windows = new Map<string, number>();

export const fakeOps: Ops = {
  async rateLimit(key, max, windowSeconds) {
    const k = `${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const n = (windows.get(k) ?? 0) + 1;
    windows.set(k, n);
    if (windows.size > 5000) windows.clear();
    return n <= max;
  },
  aiCallsSince: (userId, since) =>
    read((db) => db.aiLogs.filter((l) => l.userId === userId && l.createdAt >= since.toISOString()).length),
  recordJob: (run) =>
    tx((db) => {
      db.jobRuns.push({ job: run.job, status: run.status, attempts: run.attempts, error: run.error, startedAt: run.startedAt.toISOString() });
      db.jobRuns = db.jobRuns.slice(-200);
    }),
  pruneVersions: async () => 0,
  pruneAiLogs: () =>
    tx((db) => {
      const cut = new Date(Date.now() - 180 * 864e5).toISOString();
      const before = db.aiLogs.length;
      db.aiLogs = db.aiLogs.filter((l) => l.createdAt >= cut);
      return before - db.aiLogs.length;
    }),
  pruneHousekeeping: () =>
    tx((db) => {
      const before = db.stripeEvents.length;
      db.stripeEvents = db.stripeEvents.slice(-1000);
      return { stripe_events: before - db.stripeEvents.length };
    }),
};

// ---------------------------------------------------------------------------
// auth: a local stand-in for Supabase Auth with the same behaviour: verified
// email before the first sign-in, one-time emailed links, httpOnly cookie.

const SESSION_COOKIE = "sid";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const TTL: Record<EmailLinkType, number> = { email: 24 * 3600e3, recovery: 3600e3, email_change: 24 * 3600e3 };

function issueToken(db: Db, userId: string, type: EmailLinkType, newEmail?: string) {
  const token = randomBytes(24).toString("base64url");
  db.emailTokens = db.emailTokens.filter((t) => !(t.userId === userId && t.type === type) && t.expiresAt > now());
  db.emailTokens.push({ hash: sha(token), userId, type, newEmail, expiresAt: new Date(Date.now() + TTL[type]).toISOString() });
  return token;
}
const link = (origin: string, token: string, type: EmailLinkType) => `${origin}/auth/confirm?token_hash=${token}&type=${type}`;

async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

async function startSession(db: Db, userId: string) {
  const s = { token: randomBytes(32).toString("base64url"), userId, expiresAt: new Date(Date.now() + 30 * 864e5).toISOString() };
  db.sessions = db.sessions.filter((x) => x.expiresAt > now());
  db.sessions.push(s);
  (await cookies()).set(SESSION_COOKIE, s.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(s.expiresAt),
  });
}

async function sessionUserId(db: Db) {
  const token = await sessionToken();
  return db.sessions.find((x) => x.token === token && x.expiresAt > now())?.userId ?? null;
}

const findByEmail = (db: Db, email: string) => db.users.find((u) => u.email === email.trim().toLowerCase());

export const fakeAuth: AuthProvider = {
  currentUserId: () => read((db) => sessionUserId(db)),

  async signUp({ email, password, fullName, origin }) {
    const mail = await tx((db) => {
      const e = email.trim().toLowerCase();
      const existing = findByEmail(db, e);
      if (existing) return emails.accountExists(e, `${origin}/login`, `${origin}/forgot-password`);
      const u: FakeUser = {
        id: randomUUID(), email: e, fullName: fullName.trim(), plan: "free", theme: "system", appLanguage: "en-US",
        onboarding: {}, createdAt: now(), passwordHash: hash(password), emailVerified: false, stripeCustomerId: null,
      };
      db.users.push(u);
      return emails.verify(e, link(origin, issueToken(db, u.id, "email"), "email"));
    });
    await sendEmail(mail);
    return "verify_email";
  },

  signIn: (email, password) =>
    tx(async (db) => {
      const u = findByEmail(db, email);
      if (!u || !check(password, u.passwordHash)) return "bad_credentials" as const;
      if (!u.emailVerified) return "unverified" as const;
      await startSession(db, u.id);
      return "ok" as const;
    }),

  async resendVerification(email, origin) {
    const mail = await tx((db) => {
      const u = findByEmail(db, email);
      return u && !u.emailVerified ? emails.verify(u.email, link(origin, issueToken(db, u.id, "email"), "email")) : null;
    });
    if (mail) await sendEmail(mail);
  },

  signOut: (scope) =>
    tx(async (db) => {
      const token = await sessionToken();
      const userId = db.sessions.find((s) => s.token === token)?.userId;
      if (scope === "local") db.sessions = db.sessions.filter((s) => s.token !== token);
      else if (userId) db.sessions = db.sessions.filter((s) => s.userId !== userId || (scope === "others" && s.token === token));
      if (scope !== "others") (await cookies()).delete(SESSION_COOKIE);
    }),

  async sendPasswordReset(email, origin) {
    const mail = await tx((db) => {
      const u = findByEmail(db, email);
      return u ? emails.reset(u.email, link(origin, issueToken(db, u.id, "recovery"), "recovery")) : null;
    });
    if (mail) await sendEmail(mail);
  },

  verifyEmailLink: (tokenHash, type) =>
    tx(async (db) => {
      const t = db.emailTokens.find((x) => x.hash === sha(tokenHash) && x.type === type && x.expiresAt > now());
      const u = t && db.users.find((x) => x.id === t.userId);
      if (!t || !u) return false;
      db.emailTokens = db.emailTokens.filter((x) => x !== t);
      if (type === "email_change") {
        if (!t.newEmail || findByEmail(db, t.newEmail)) return false;
        u.email = t.newEmail;
      }
      u.emailVerified = true;
      await startSession(db, u.id);
      return true;
    }),

  oauthStart: async () => null,
  exchangeCode: async () => false,

  updatePassword: (password) =>
    tx(async (db) => {
      const id = await sessionUserId(db);
      const user = id ? db.users.find((x) => x.id === id) : undefined;
      if (!user) throw new AuthError();
      user.passwordHash = hash(password);
    }),

  async changeEmail(newEmail, origin) {
    const mail = await tx(async (db) => {
      const id = await sessionUserId(db);
      if (!id) throw new AuthError();
      const e = newEmail.trim().toLowerCase();
      if (findByEmail(db, e)) throw new Error("email_taken");
      return emails.changeEmail(e, link(origin, issueToken(db, id, "email_change", e), "email_change"));
    });
    await sendEmail(mail);
  },

  emailOf: (userId) => read((db) => db.users.find((u) => u.id === userId)?.email ?? null),

  deleteUser: (userId) =>
    tx(async (db) => {
      db.users = db.users.filter((u) => u.id !== userId);
      for (const k of ["sessions", "emailTokens", "resumes", "targets", "usage", "exports", "aiLogs", "subscriptions"] as const) {
        (db[k] as { userId: string }[]) = (db[k] as { userId: string }[]).filter((x) => x.userId !== userId);
      }
      (await cookies()).delete(SESSION_COOKIE);
    }),
};
