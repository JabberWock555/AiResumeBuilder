import "server-only";
import { createHmac } from "node:crypto";
import { ops } from "./repo";
import { RateLimitError } from "./errors";

// Fixed-window rate limits, counted in Postgres (or in memory locally).
// Keys are keyed hashes, so no email address or IP is ever stored.

type Rule = { name: string; value: string; max: number; windowSeconds: number; perIp?: boolean };

const salt = () => process.env.RATE_LIMIT_SALT || process.env.PRINT_TOKEN_SECRET || "local-dev";
const hashKey = (s: string) => createHmac("sha256", salt()).update(s).digest("base64url").slice(0, 24);

/** The caller's IP. On Vercel the first x-forwarded-for entry is set by the platform. */
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Throws RateLimitError (429) if any rule is over its limit. */
export async function limit(...rules: Rule[]) {
  // Local runs (tests, the walkthrough) all come from one address.
  const ipScale = process.env.NODE_ENV === "development" ? 10 : 1;
  for (const r of rules) {
    const max = r.perIp ? r.max * ipScale : r.max;
    const ok = await ops.rateLimit(`${r.name}:${hashKey(r.value.toLowerCase())}`, max, r.windowSeconds);
    if (!ok) throw new RateLimitError(r.windowSeconds);
  }
}

export const perIp = (name: string, req: Request, max: number, windowSeconds: number): Rule => ({
  name: `${name}:ip`, value: clientIp(req), max, windowSeconds, perIp: true,
});
export const perKey = (name: string, value: string, max: number, windowSeconds: number): Rule => ({
  name, value, max, windowSeconds,
});
