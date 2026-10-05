#!/usr/bin/env node
// Seeds the local fake database (.data/db.json) with a demo account and one
// filled-in resume, so screens have something real to show.
//
//   npm run seed            add the demo account if it isn't there
//   npm run seed -- --reset wipe .data/db.json first
//
// Test login for local development only (not a real account anywhere):
//   email:    demo@example.com
//   password: demo-password-123

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), ".data", "db.json");
const EMAIL = "demo@example.com";
const PASSWORD = "demo-password-123";

const empty = () => ({ users: [], sessions: [], resetTokens: [], resumes: [], targets: [], usage: [], exports: [], aiLogs: [] });
const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
};
const id = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const now = new Date().toISOString();

if (process.argv.includes("--reset")) await rm(FILE, { force: true });
let db;
try {
  db = { ...empty(), ...JSON.parse(await readFile(FILE, "utf8")) };
} catch {
  db = empty();
}

if (db.users.some((u) => u.email === EMAIL)) {
  console.log("Demo account already exists. Use --reset to start over.");
  process.exit(0);
}

const userId = randomUUID();
db.users.push({
  id: userId, email: EMAIL, fullName: "Jordan Lee", plan: "free", theme: "system", appLanguage: "en-US",
  onboarding: {}, createdAt: now, passwordHash: hash(PASSWORD),
});

const resumeId = randomUUID();
const b = (text) => ({ id: id("b"), text });
db.resumes.push({
  id: resumeId,
  userId,
  folderId: null,
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
  revision: 1,
  source: "scratch",
  lastScore: null,
  createdAt: now,
  updatedAt: now,
});

db.targets.push({
  userId,
  resumeId,
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
  dismissed: [],
  extractedAt: now,
  extractionModel: "seed",
});

await mkdir(path.dirname(FILE), { recursive: true });
await writeFile(FILE, JSON.stringify(db, null, 1));
console.log(`Seeded ${FILE}: demo account (see scripts/seed.mjs) with 1 resume.`);
