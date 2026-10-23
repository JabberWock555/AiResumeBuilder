import "server-only";
import { config } from "../config";
import { fakeAuth, fakeBilling, fakeOps, fakeRepo } from "./fake";
import { supabaseBilling, supabaseOps, supabaseRepo } from "./supabase";
import { supabaseAuth } from "../auth/supabase";
import type { AuthProvider } from "../auth/types";
import type { BillingStore, Ops, Repo } from "./types";

// The one place that picks the data layer: Supabase when its keys are set,
// the local JSON file otherwise (see src/server/config.ts).
const live = config.backend === "supabase";

export const repo: Repo = live ? supabaseRepo : fakeRepo;
export const auth: AuthProvider = live ? supabaseAuth : fakeAuth;
export const billingStore: BillingStore = live ? supabaseBilling : fakeBilling;
export const ops: Ops = live ? supabaseOps : fakeOps;
