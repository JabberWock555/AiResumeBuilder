import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/repo";
import type { EmailLinkType } from "@/server/auth/types";

// Every emailed link lands here: confirm sign-up, reset password, confirm a
// new email. A good link signs the user in and moves them on.
//
// Two link shapes are accepted:
// - ?token_hash=…&type=… from our templates (supabase/templates), which work
//   even when the email is opened on another device;
// - ?code=…&next=… from Supabase's default templates (PKCE), which only work
//   in the browser that asked for the email.
const NEXT: Record<EmailLinkType, string> = {
  email: "/app?welcome=1",
  recovery: "/reset-password",
  email_change: "/app/settings?email=changed",
};

/** Only our own paths: never redirect to another site. */
const safeNext = (n: string | null) => (n && /^\/(app|reset-password)(\/|\?|$)/.test(n) ? n : null);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const next = safeNext(q.get("next"));

  const code = q.get("code");
  if (code) {
    if (code.length > 200 || !(await auth.exchangeCode(code))) return to(next === "/reset-password" ? "/forgot-password?error=link" : "/login?error=link");
    return to(next ?? "/app?welcome=1");
  }

  const tokenHash = q.get("token_hash");
  const raw = q.get("type");
  // Supabase's older templates say "signup" for the confirm link.
  const type = (raw === "signup" ? "email" : raw) as EmailLinkType;
  if (!tokenHash || !(type in NEXT) || tokenHash.length > 200) return to("/login?error=link");
  if (!(await auth.verifyEmailLink(tokenHash, type))) return to(type === "recovery" ? "/forgot-password?error=link" : "/login?error=link");
  return to(next ?? NEXT[type]);
}
