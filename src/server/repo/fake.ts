import "server-only";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SETTINGS, blankContent } from "@/lib/resume/schema";
import { ConflictError, NotFoundError, QuotaError } from "../errors";
import { PLAN_LIMITS, periodKey } from "./limits";
import type { AuthStore, QuotaKind, Repo, Resume, TargetJob, Usage, User } from "./types";

// A local JSON file standing in for Postgres until /replica-backend.
// Every call reads the file and writes it back under one in-process lock, so
// it's slow and single-machine, and that's fine for development.

type Db = {
  users: (User & { passwordHash: string })[];
  sessions: { token: string; userId: string; expiresAt: string }[];
  resetTokens: { token: string; userId: string; expiresAt: string }[];
  resumes: Resume[];
  targets: (TargetJob & { userId: string })[];
  usage: { userId: string; period: string; kind: QuotaKind; used: number }[];
  exports: { userId: string; resumeId: string; format: string; revision: number; templateId: string; createdAt: string }[];
  aiLogs: { userId: string; resumeId: string | null; kind: string; model: string; counted: boolean; status: string; createdAt: string }[];
};

const FILE = path.join(process.cwd(), ".data", "db.json");
const empty = (): Db => ({ users: [], sessions: [], resetTokens: [], resumes: [], targets: [], usage: [], exports: [], aiLogs: [] });

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
const read = <T,>(fn: (db: Db) => T) => tx(fn, false);

const now = () => new Date().toISOString();
const clone = <T,>(x: T): T => structuredClone(x);
const publicUser = ({ passwordHash: _ph, ...u }: User & { passwordHash: string }): User => {
  void _ph;
  return u;
};

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

  deleteUser: (userId) =>
    tx((db) => {
      db.users = db.users.filter((u) => u.id !== userId);
      for (const k of ["sessions", "resetTokens", "resumes", "targets", "usage", "exports", "aiLogs"] as const) {
        (db[k] as { userId: string }[]) = (db[k] as { userId: string }[]).filter((x) => x.userId !== userId);
      }
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
      db.aiLogs.push({ userId, ...entry, createdAt: now() });
      if (db.aiLogs.length > 2000) db.aiLogs = db.aiLogs.slice(-2000);
    }),
};

export const fakeAuth: AuthStore = {
  createUser: (email, password, fullName) =>
    tx((db) => {
      const e = email.trim().toLowerCase();
      if (db.users.some((u) => u.email === e)) throw new Error("email_taken");
      const u = {
        id: randomUUID(), email: e, fullName: fullName.trim(), plan: "free" as const, theme: "system" as const,
        appLanguage: "en-US", onboarding: {}, createdAt: now(), passwordHash: hash(password),
      };
      db.users.push(u);
      return publicUser(u);
    }),

  verifyPassword: (email, password) =>
    read((db) => {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase());
      return u && check(password, u.passwordHash) ? publicUser(u) : null;
    }),

  createSession: (userId) =>
    tx((db) => {
      const s = { token: randomBytes(32).toString("base64url"), userId, expiresAt: new Date(Date.now() + 30 * 864e5).toISOString() };
      db.sessions = db.sessions.filter((x) => x.expiresAt > now());
      db.sessions.push(s);
      return { token: s.token, expiresAt: s.expiresAt };
    }),

  sessionUser: (token) =>
    read((db) => {
      const s = db.sessions.find((x) => x.token === token && x.expiresAt > now());
      const u = s && db.users.find((x) => x.id === s.userId);
      return u ? publicUser(u) : null;
    }),

  deleteSession: (token) =>
    tx((db) => {
      db.sessions = db.sessions.filter((x) => x.token !== token);
    }),

  createResetToken: (email) =>
    tx((db) => {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase());
      if (!u) return null;
      const token = randomBytes(24).toString("base64url");
      db.resetTokens.push({ token, userId: u.id, expiresAt: new Date(Date.now() + 3600e3).toISOString() });
      return token;
    }),

  resetPassword: (token, password) =>
    tx((db) => {
      const t = db.resetTokens.find((x) => x.token === token && x.expiresAt > now());
      const u = t && db.users.find((x) => x.id === t.userId);
      if (!u) return false;
      u.passwordHash = hash(password);
      db.resetTokens = db.resetTokens.filter((x) => x.token !== token);
      db.sessions = db.sessions.filter((x) => x.userId !== u.id);
      return true;
    }),
};

