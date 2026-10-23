import "server-only";
import { config } from "../config";
import { InputError } from "../errors";
import { adminClient, sessionClaims, userClient } from "../supabase";
import type { AuthProvider } from "./types";

// Supabase Auth. Emails (verify, reset, change email) are sent by Supabase
// through Resend as its SMTP server, using the templates in supabase/templates,
// which link to /auth/confirm with a token hash. That works when the link is
// opened on a different device from the one that asked for it.

export const supabaseAuth: AuthProvider = {
  async currentUserId() {
    return (await sessionClaims(await userClient()))?.sub ?? null;
  },

  async signUp({ email, password, fullName, origin }) {
    const sb = await userClient();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (error) {
      if (error.code === "weak_password") throw new InputError({ fieldErrors: { password: [error.message] } });
      // An existing address gets the same answer as a new one.
      if (error.code !== "user_already_exists") throw error;
    }
    // Email confirmation must be on (Authentication → Sign In / Providers → Email).
    if (data.session) console.warn("Supabase signed a user in without email confirmation. Turn on 'Confirm email'.");
    return "verify_email";
  },

  async signIn(email, password) {
    const sb = await userClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (!error) return "ok";
    if (error.code === "email_not_confirmed") return "unverified";
    if (error.code === "invalid_credentials") return "bad_credentials";
    throw error;
  },

  async resendVerification(email, origin) {
    const sb = await userClient();
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${origin}/auth/confirm` } });
    // Rate limits and unknown addresses look the same as success to the caller.
    if (error && error.status !== 429 && error.status !== 400) throw error;
  },

  async signOut(scope) {
    const sb = await userClient();
    await sb.auth.signOut({ scope });
  },

  async sendPasswordReset(email, origin) {
    const sb = await userClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
    if (error && error.status !== 429) throw error;
  },

  async verifyEmailLink(tokenHash, type) {
    const sb = await userClient();
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    return !error;
  },

  async oauthStart(provider, origin) {
    if (!config.oauth.includes(provider)) return null;
    const sb = await userClient();
    const { data, error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
    });
    if (error) throw error;
    return data.url;
  },

  async exchangeCode(code) {
    const sb = await userClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    return !error;
  },

  async updatePassword(password) {
    const sb = await userClient();
    const { error } = await sb.auth.updateUser({ password });
    if (!error) return;
    if (error.code === "weak_password" || error.code === "same_password")
      throw new InputError({ fieldErrors: { password: [error.code === "same_password" ? "Choose a password you haven't used here before." : error.message] } });
    throw error;
  },

  async changeEmail(newEmail, origin) {
    const sb = await userClient();
    const { error } = await sb.auth.updateUser({ email: newEmail }, { emailRedirectTo: `${origin}/auth/confirm` });
    if (!error) return;
    if (error.code === "email_exists") throw new Error("email_taken");
    throw error;
  },

  async emailOf(userId) {
    const { data } = await adminClient().auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  },

  async deleteUser(userId) {
    const sb = await userClient();
    await sb.auth.signOut({ scope: "global" });
    // Deleting the auth user cascades to every table (on delete cascade).
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
  },
};
