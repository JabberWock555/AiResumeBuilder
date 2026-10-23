// Sign-in, behind one interface: Supabase Auth (supabase.ts) when its keys are
// set, a local stand-in (fake.ts) otherwise. Both keep the session in httpOnly
// cookies they manage themselves, verify email before the first sign-in, and
// send their emails through links to /auth/confirm.

export type EmailLinkType = "email" | "recovery" | "email_change";
export type OAuthProvider = "google" | "apple";

export interface AuthProvider {
  /** The signed-in user's id, from a verified session, or null. */
  currentUserId(): Promise<string | null>;
  /**
   * Always answers "verify_email", whether or not the address already has an
   * account, so sign-up can't be used to find out who has one.
   */
  signUp(i: { email: string; password: string; fullName: string; origin: string }): Promise<"verify_email">;
  signIn(email: string, password: string): Promise<"ok" | "bad_credentials" | "unverified">;
  resendVerification(email: string, origin: string): Promise<void>;
  /** "global" ends every session on every device; "others" keeps this one. */
  signOut(scope: "local" | "global" | "others"): Promise<void>;
  sendPasswordReset(email: string, origin: string): Promise<void>;
  /** Checks a link from an email and signs the user in. */
  verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<boolean>;
  /** Starts OAuth: the URL to send the browser to, or null if the provider is off. */
  oauthStart(provider: OAuthProvider, origin: string): Promise<string | null>;
  /** Finishes OAuth (and PKCE email links) with the code from the callback. */
  exchangeCode(code: string): Promise<boolean>;
  /** Needs a session (after a recovery link, or signed in). */
  updatePassword(password: string): Promise<void>;
  /** Emails a confirmation link to the new address; the email changes once it's clicked. */
  changeEmail(newEmail: string, origin: string): Promise<void>;
  /** The account's email, as the auth system has it. */
  emailOf(userId: string): Promise<string | null>;
  /** Removes the auth user, which cascades to every row they own. */
  deleteUser(userId: string): Promise<void>;
}
