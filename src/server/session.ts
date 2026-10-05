import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./repo";
import { AuthError } from "./errors";
import type { User } from "./repo/types";

export const SESSION_COOKIE = "sid";

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? auth.sessionUser(token) : null;
}

/** For route handlers: throws AuthError (401). */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AuthError();
  return u;
}

/** For pages: sends signed-out visitors to the login page. */
export async function requireUserPage(next?: string): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return u;
}

export async function startSession(userId: string) {
  const s = await auth.createSession(userId);
  (await cookies()).set(SESSION_COOKIE, s.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(s.expiresAt),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await auth.deleteSession(token);
  jar.delete(SESSION_COOKIE);
}
