import "server-only";
import { redirect } from "next/navigation";
import { auth, repo } from "./repo";
import { AuthError } from "./errors";
import type { User } from "./repo/types";

export async function currentUser(): Promise<User | null> {
  const id = await auth.currentUserId();
  return id ? repo.getUser(id) : null;
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
