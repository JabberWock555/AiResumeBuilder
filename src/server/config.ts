import "server-only";

// Which real services are switched on. Each one turns on when its keys are in
// the environment (.env.local locally, the host's env vars in production), so
// the app runs with no keys at all on the local stand-ins.

const env = process.env;

export const config = {
  /** Supabase (Postgres + Auth) when its keys are set; the local JSON file otherwise. */
  backend: env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? ("supabase" as const) : ("fake" as const),
  billing: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_MONTH),
  /** The AI Gateway reads AI_GATEWAY_API_KEY, or the OIDC token Vercel injects. */
  ai: Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN),
  email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
  /** OAuth providers switched on in the Supabase dashboard, e.g. "google,apple". */
  oauth: (env.AUTH_OAUTH_PROVIDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((p): p is "google" | "apple" => p === "google" || p === "apple"),
  models: {
    /** Frequent inline calls (bullets). */
    fast: env.AI_MODEL_FAST || "anthropic/claude-haiku-4.5",
    /** Summaries, keyword bullets and job-ad keyword extraction. */
    strong: env.AI_MODEL_STRONG || "anthropic/claude-sonnet-5.5",
  },
};

if (config.backend === "fake" && env.NODE_ENV === "production" && env.VERCEL_ENV === "production") {
  console.error("Production is running on the local JSON data layer. Set the Supabase env vars.");
}

/** The public origin for links in emails and redirects. Never taken from request headers in production. */
export function appUrl(req?: Request) {
  if (env.NEXT_PUBLIC_APP_URL) return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (req && env.NODE_ENV !== "production") return new URL(req.url).origin;
  throw new Error("NEXT_PUBLIC_APP_URL is not set");
}
