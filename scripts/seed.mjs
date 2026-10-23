#!/usr/bin/env node
// Seeds a demo account with one filled-in resume and a target job, so screens
// have something real to show. The person and companies are made up.
//
// Local JSON data layer (no Supabase keys):
//   npm run seed            add the demo account if it isn't there
//   npm run seed -- --reset wipe .data/db.json first
//
// A Supabase project (keys in .env.local), development projects only:
//   npm run seed -- --supabase            create the demo user (email already
//                                         confirmed) and their resume
//   npm run seed -- --supabase --reset    delete the demo user first
//
// Test login for local development only (not a real account anywhere):
//   email:    demo@example.com
//   password: demo-password-123

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {}
const SUPABASE = process.argv.includes("--supabase");
if (!SUPABASE && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.log("Supabase keys are set, so the app uses Supabase, not .data/db.json.");
  console.log("To seed the Supabase project (development only): npm run seed -- --supabase");
  process.exit(0);
}

const FILE = path.join(process.cwd(), ".data", "db.json");
const EMAIL = "demo@example.com";
const PASSWORD = "demo-password-123";

const empty = () => ({
  users: [], sessions: [], emailTokens: [], resumes: [], targets: [], usage: [], exports: [], aiLogs: [],
  subscriptions: [], stripeEvents: [], jobRuns: [],
});
const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
};
const id = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const now = new Date().toISOString();

const b = (text) => ({ id: id("b"), text });
const resume = {
  name: "Jordan Lee – Product Designer",
  experienceLevel: "mid_senior",
  language: "en-US",
  templateId: "standard",
  settings: { font: "Source Serif 4", fontSize: 10, sectionSpacing: 3, divider: true, icons: false, accent: "ink", pageSize: "letter" },
  content: {
    contact: {
      fullName: "Jordan Lee", email: "jordan.lee@example.com", phone: "(555) 010-4477", linkedin: "jordanlee-design",
      website: "jordanlee.design", city: "Portland", country: "United States", showCountry: false, state: "Oregon", showState: true,
    },
    summary: {
      text: "Product designer with 6 years in health and fintech apps. Turns messy research into simple flows, and works closely with engineers to ship and measure them.",
    },
    sections: [
      {
        id: id("s"), type: "experience", hidden: false,
        entries: [
          {
            id: id("e"), role: "Senior Product Designer", company: "Harbor Health", location: "Portland, OR",
            start: { year: 2023, month: 2 }, end: "present",
            bullets: [
              b("Led the redesign of appointment booking, cutting the steps from 9 to 4 and raising completed bookings by 18%."),
              b("Ran 22 interviews with patients over 65 and turned the findings into an accessibility checklist the team now uses on every release."),
              b("Built the first shared component library in Figma with two engineers, used by 4 product teams."),
              b("i was responsible for helping with the design reviews"),
            ],
          },
          {
            id: id("e"), role: "Product Designer", company: "Ledgerline", location: "Remote",
            start: { year: 2020, month: 6 }, end: { year: 2023, month: 1 },
            bullets: [
              b("Designed the onboarding flow for small-business accounts, lifting week-one activation from 31% to 44%."),
              b("Partnered with support to fix the top 10 reasons for tickets, which dropped monthly tickets by 1,200."),
              b("Mentored 2 junior designers through their first shipped features."),
            ],
          },
        ],
      },
      {
        id: id("s"), type: "education", hidden: false,
        entries: [{ id: id("e"), degree: "BFA, Interaction Design", institution: "Pacific Northwest College of Art", location: "Portland, OR", year: 2019, minor: "", gpa: "", extra: "" }],
      },
      {
        id: id("s"), type: "skills", hidden: false,
        entries: [
          { id: id("e"), category: "Design", items: ["Figma", "Prototyping", "Design systems", "Interaction design"] },
          { id: id("e"), category: "Research", items: ["User research", "Usability testing", "Survey design"] },
        ],
      },
    ],
  },
};

const target = {
  title: "Senior Product Designer",
  company: "Fernway",
  description:
    "Fernway is hiring a Senior Product Designer to lead design for our patient app. You'll run user research and usability testing, prototype in Figma, and grow our design system. You'll work with product and engineering in an Agile team, use A/B testing to decide what ships, and make sure everything meets accessibility standards (WCAG 2.2). We want 5+ years of product design, strong interaction design, and clear communication with stakeholders.",
  keywords: [
    { term: "Figma", aliases: [], weight: 2, kind: "tool" },
    { term: "User research", aliases: ["UX research"], weight: 2, kind: "skill" },
    { term: "Usability testing", aliases: ["user testing"], weight: 2, kind: "skill" },
    { term: "Design systems", aliases: ["design system"], weight: 2, kind: "skill" },
    { term: "Accessibility", aliases: ["WCAG", "a11y"], weight: 2, kind: "skill" },
    { term: "A/B testing", aliases: ["AB testing", "experimentation"], weight: 1, kind: "skill" },
    { term: "Agile", aliases: ["Scrum", "Kanban"], weight: 1, kind: "skill" },
    { term: "Interaction design", aliases: [], weight: 1, kind: "skill" },
    { term: "Stakeholder management", aliases: ["stakeholders"], weight: 1, kind: "soft" },
    { term: "Communication", aliases: [], weight: 1, kind: "soft" },
  ],
};

if (SUPABASE) await seedSupabase();
else await seedLocal();

async function seedLocal() {
  if (process.argv.includes("--reset")) await rm(FILE, { force: true });
  let db;
  try {
    db = { ...empty(), ...JSON.parse(await readFile(FILE, "utf8")) };
  } catch {
    db = empty();
  }
  if (db.users.some((u) => u.email === EMAIL)) {
    console.log("Demo account already exists. Use --reset to start over.");
    return;
  }
  const userId = randomUUID();
  db.users.push({
    id: userId, email: EMAIL, fullName: "Jordan Lee", plan: "free", theme: "system", appLanguage: "en-US",
    onboarding: {}, createdAt: now, passwordHash: hash(PASSWORD), emailVerified: true, stripeCustomerId: null,
  });
  const resumeId = randomUUID();
  db.resumes.push({ id: resumeId, userId, folderId: null, ...resume, revision: 1, source: "scratch", lastScore: null, createdAt: now, updatedAt: now });
  db.targets.push({ userId, resumeId, ...target, dismissed: [], extractedAt: now, extractionModel: "seed" });
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(db, null, 1));
  console.log(`Seeded ${FILE}: demo account (see scripts/seed.mjs) with 1 resume.`);
}

async function seedSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  if (process.env.VERCEL_ENV === "production") throw new Error("Refusing to seed a production project.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const existing = await findUser(db, EMAIL);
  if (existing && !process.argv.includes("--reset")) {
    console.log("Demo user already exists in Supabase. Use --reset to start over.");
    return;
  }
  if (existing) await db.auth.admin.deleteUser(existing.id);

  const { data, error } = await db.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Jordan Lee" },
  });
  if (error) throw error;
  const userId = data.user.id;
  const { data: r, error: e2 } = await db
    .from("resumes")
    .insert({
      user_id: userId, name: resume.name, experience_level: resume.experienceLevel, language: resume.language,
      template_id: resume.templateId, settings: resume.settings, content: resume.content,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  const { error: e3 } = await db.from("target_jobs").insert({
    resume_id: r.id, user_id: userId, title: target.title, company: target.company, description: target.description,
    keywords: target.keywords, extracted_at: now, extraction_model: "seed",
  });
  if (e3) throw e3;
  console.log("Seeded Supabase: demo user (see scripts/seed.mjs, email already confirmed) with 1 resume.");
}

async function findUser(db, email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u || data.users.length < 200) return u ?? null;
  }
  return null;
}
