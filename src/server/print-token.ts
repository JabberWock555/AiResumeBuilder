import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Short-lived signed token that lets headless Chromium load one resume's print
// page without a session cookie. Valid for 60 seconds.

const g = globalThis as unknown as { __printSecret?: string };
function secret() {
  if (process.env.PRINT_TOKEN_SECRET) return process.env.PRINT_TOKEN_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("PRINT_TOKEN_SECRET is not set");
  return (g.__printSecret ??= randomBytes(32).toString("hex"));
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function makePrintToken(userId: string, resumeId: string, revision: number) {
  const payload = `${userId}.${resumeId}.${revision}.${Date.now() + 60_000}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readPrintToken(token: string, resumeId: string): { userId: string; revision: number } | null {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, id, rev, exp] = payload.split(".");
  if (id !== resumeId || Number(exp) < Date.now()) return null;
  return { userId, revision: Number(rev) };
}
