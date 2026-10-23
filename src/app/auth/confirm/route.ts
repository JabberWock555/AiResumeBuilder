import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/repo";
import type { EmailLinkType } from "@/server/auth/types";

// Every emailed link lands here: confirm sign-up, reset password, confirm a
// new email. A good link signs the user in and moves them on.
const NEXT: Record<EmailLinkType, string> = {
  email: "/app?welcome=1",
  recovery: "/reset-password",
  email_change: "/app/settings?email=changed",
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tokenHash = q.get("token_hash");
  const raw = q.get("type");
  // Supabase's older templates say "signup" for the confirm link.
  const type = (raw === "signup" ? "email" : raw) as EmailLinkType;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  if (!tokenHash || !(type in NEXT) || tokenHash.length > 200) return to("/login?error=link");
  if (!(await auth.verifyEmailLink(tokenHash, type))) return to(type === "recovery" ? "/forgot-password?error=link" : "/login?error=link");
  return to(NEXT[type]);
}
