import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthError, ConflictError, NotFoundError, QuotaError } from "./errors";

// Two kinds of Supabase client:
// - userClient(): acts as the signed-in user, from their session cookies, so
//   row level security applies to every query. Used for anything a user does.
// - adminClient(): the service role, which bypasses RLS. Used only by Stripe
//   webhooks, cron jobs, refunds, AI logs, the print page and account deletion,
//   each of which filters by user id explicitly.
//
// The browser never talks to Supabase directly: every call goes through our
// route handlers, so the session cookies can be httpOnly.

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

type Jar = Awaited<ReturnType<typeof cookies>>;
const clients = new WeakMap<Jar, SupabaseClient>();

/** The signed-in user's client for this request (one per request). */
export async function userClient(): Promise<SupabaseClient> {
  const jar = await cookies();
  let sb = clients.get(jar);
  if (!sb) {
    sb = createServerClient(url(), anonKey(), {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll: () => jar.getAll(),
        setAll(list) {
          try {
            for (const { name, value, options } of list) jar.set(name, value, { ...options, ...COOKIE_OPTIONS });
          } catch {
            // Server components can't set cookies. The proxy refreshes the
            // session before the page renders, so this is safe to ignore.
          }
        },
      },
    });
    clients.set(jar, sb);
  }
  return sb;
}

let admin: SupabaseClient | undefined;
export function adminClient(): SupabaseClient {
  admin ??= createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

const claimsCache = new WeakMap<SupabaseClient, Promise<{ sub: string; email?: string } | null>>();

/** The verified user id and email from the session's JWT, or null. */
export function sessionClaims(sb: SupabaseClient) {
  let p = claimsCache.get(sb);
  if (!p) {
    p = sb.auth.getClaims().then(({ data, error }) =>
      error || !data?.claims?.sub ? null : { sub: data.claims.sub as string, email: data.claims.email as string | undefined },
    );
    claimsCache.set(sb, p);
  }
  return p;
}

/** The user's client, after checking the session belongs to `userId`. */
export async function clientFor(userId: string) {
  const sb = await userClient();
  const c = await sessionClaims(sb);
  if (c?.sub !== userId) throw new AuthError();
  return sb;
}

type PgError = { code?: string; message: string; details?: string | null; hint?: string | null };

/** Turns a PostgREST error into one of ours. */
export function fail(e: PgError, current?: unknown): never {
  if (e.message?.includes("quota_exceeded")) throw new QuotaError(e.details || "unknown");
  if (e.code === "28000" || e.code === "PGRST301" || e.message?.includes("JWT")) throw new AuthError();
  if (e.code === "P0002" || e.code === "PGRST116") throw new NotFoundError(e.message);
  if (e.code === "40001") throw new ConflictError(current);
  throw new Error(`database: ${e.code ?? ""} ${e.message}`);
}
