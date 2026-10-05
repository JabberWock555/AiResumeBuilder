import "server-only";
import { fakeAuth, fakeRepo } from "./fake";
import type { AuthStore, Repo } from "./types";

// The one place that picks the data layer. /replica-backend replaces these two
// lines with the Supabase implementations.
export const repo: Repo = fakeRepo;
export const auth: AuthStore = fakeAuth;
