#!/usr/bin/env node
// Checks a real Supabase project after `npm run db:migrate`: the migrations
// are there, and row level security keeps two users apart over the real API.
// Creates two throwaway users (confirmed, @example.com, random passwords),
// runs the checks as each of them, then deletes them. Development projects only.
//
//   npm run check:supabase

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra && !ok ? ` (${extra})` : ""}`);
};

async function makeUser(label) {
  const email = `rls-check-${label}-${randomBytes(4).toString("hex")}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Check ${label}` } });
  if (error) throw error;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, db: client };
}

const users = [];
try {
  const limits = await createClient(url, anon).from("plan_limits").select("plan");
  check("migrations applied (plan_limits readable)", limits.data?.length === 15, limits.error?.message);

  const A = await makeUser("a");
  const B = await makeUser("b");
  users.push(A, B);

  const profile = await A.db.from("profiles").select("plan").eq("id", A.id).single();
  check("profile created for a new user", profile.data?.plan === "free", profile.error?.message);

  const r = await A.db.from("resumes").insert({ user_id: A.id, name: "Check", experience_level: "junior" }).select("id").single();
  check("A creates a resume", !r.error, r.error?.message);
  const resumeA = r.data?.id;

  const second = await A.db.from("resumes").insert({ user_id: A.id, name: "Check 2", experience_level: "junior" });
  check("free plan blocks a second resume", /quota_exceeded/.test(second.error?.message ?? ""), second.error?.message);

  const seen = await B.db.from("resumes").select("id");
  check("B sees none of A's resumes", seen.data?.length === 0, seen.error?.message);

  const upd = await B.db.from("resumes").update({ name: "hacked" }).eq("id", resumeA).select("id");
  check("B cannot update A's resume", (upd.data?.length ?? 0) === 0, upd.error?.message);

  const ins = await B.db.from("resumes").insert({ user_id: A.id, name: "X", experience_level: "junior" });
  check("B cannot create a resume as A", Boolean(ins.error));

  const tgt = await B.db.from("target_jobs").insert({ resume_id: resumeA, user_id: B.id, title: "Job", description: "x".repeat(60) });
  check("B cannot attach a job ad to A's resume", Boolean(tgt.error));

  const exp = await B.db.rpc("record_export", { p_resume: resumeA, p_format: "pdf", p_revision: 1, p_template: "standard" });
  check("B cannot record an export on A's resume", Boolean(exp.error));

  const q = await A.db.rpc("consume_quota", { p_kind: "pdf_download" });
  check("A spends a download", q.data === 2, q.error?.message);

  const refund = await A.db.rpc("refund_quota_now", { p_user: A.id, p_kind: "pdf_download" });
  check("A cannot refund their own quota", Boolean(refund.error));

  const plan = await A.db.from("profiles").update({ plan: "pro" }).eq("id", A.id);
  check("A cannot make themselves Pro", Boolean(plan.error));

  const subs = await A.db.from("subscriptions").insert({ user_id: A.id, kind: "month", status: "active", amount_cents: 0, currency: "usd" });
  check("A cannot write a subscription", Boolean(subs.error));

  const rl = await A.db.from("rate_limits").select("key");
  check("rate limit rows are hidden from users", (rl.data?.length ?? 0) === 0);

  const up = await A.db.storage.from("photos").upload(`${B.id}/x.png`, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  check("A cannot upload into B's storage folder", Boolean(up.error));

  const anonRead = await createClient(url, anon).from("resumes").select("id");
  check("signed-out visitors see no resumes", (anonRead.data?.length ?? 0) === 0);
} catch (e) {
  fail++;
  console.error(`ERROR ${e.message}`);
} finally {
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  if (users.length) {
    const left = await admin.from("resumes").select("id").in("user_id", users.map((u) => u.id));
    check("deleting the users removed their rows", left.data?.length === 0, left.error?.message);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
