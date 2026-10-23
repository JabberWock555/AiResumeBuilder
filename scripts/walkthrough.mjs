#!/usr/bin/env node
// End-to-end walkthrough of the core loop against the local dev server, with
// local Chrome. Signs up a fresh test account (confirming it through the
// emailed link), builds a resume, tailors it, downloads the PDF, hits the free
// limits, checks a second user can't reach the first one's resume, changes
// email and password through emailed links, signs out everywhere, deletes the
// account, and saves screenshots for /replica-diff into replica/clone-screens/.
// Also collects console errors, axe violations and sideways scroll at phone width.
//
//   npm run dev            (in another terminal, with no Supabase/Resend keys)
//   npm run walkthrough
//
// It reads emails from .data/outbox.jsonl, so it runs on the local stand-ins.
// The test accounts it creates live only in the local .data/db.json.

import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "replica", "clone-screens");
const DL = path.join(process.cwd(), ".data", "downloads");
const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(
  (p) => p && existsSync(p),
);
const AXE = await readFile(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf8");

const results = [];
let quotaTest = false;
const problems = { console: [], axe: [], overflow: [] };
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
await rm(path.join(OUT, "_crash.png"), { force: true });
await rm(DL, { recursive: true, force: true });
await mkdir(DL, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await page.setViewport({ width: 1440, height: 900 });
// Refusals the walkthrough asks for on purpose (quota, wrong password, rate limit) aren't errors.
let expectRefusals = false;
page.on("console", (m) => m.type() === "error" && !(quotaTest && m.text().includes("402")) && !(expectRefusals && /status of 40[013]|status of 429/.test(m.text())) && problems.console.push(`${page.url()} :: ${m.text()}`));
page.on("pageerror", (e) => problems.console.push(`${page.url()} :: ${e.message}`));
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });

async function go(p) {
  await page.goto(BASE + p, { waitUntil: "networkidle0", timeout: 90_000 });
}
async function shot(id) {
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, `${id}.png`) });
}
async function axe(label) {
  await page.addScriptTag({ content: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.id} x${x.nodes.length}: ${x.nodes[0]?.target?.join(" ")}`));
  v.forEach((x) => problems.axe.push(`${label}: ${x}`));
  return v.length;
}
const click = (sel) => page.locator(sel).click();
const fill = async (sel, text) => {
  const el = await page.locator(sel).waitHandle();
  await el.click({ count: 3 });
  await el.type(text);
};
/** The link in the newest email of a kind to an address, from the local outbox. */
async function emailLink(to, tag) {
  for (let i = 0; i < 25; i++) {
    const lines = (await readFile(path.join(process.cwd(), ".data", "outbox.jsonl"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
    const mail = lines.map((l) => JSON.parse(l)).filter((m) => m.to === to && m.tag === tag).at(-1);
    const link = mail?.text.match(/https?:\/\/\S+\/auth\/confirm\S+/)?.[0];
    if (link) return link;
    await sleep(200);
  }
  throw new Error(`no ${tag} email for the test account`);
}
/** Signs up and confirms a user through the API in a fresh, separate browser context. */
async function secondUser(label) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  const mail = `walkthrough-${label}+${Date.now()}@example.com`;
  const pw = randomBytes(12).toString("base64url");
  await p.goto(BASE + "/signup", { waitUntil: "networkidle0" });
  await p.evaluate(async (body) => fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { fullName: `Second ${label}`, email: mail, password: pw });
  await p.goto(await emailLink(mail, "verify"), { waitUntil: "networkidle0" });
  return { ctx, page: p, email: mail };
}
const api = (p, url, init = {}) =>
  p.evaluate(
    async (url, init) => {
      const r = await fetch(url, { ...init, headers: init.body ? { "content-type": "application/json" } : undefined });
      return r.status;
    },
    url,
    init,
  );

async function waitSaved() {
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes("Saved"), { timeout: 15_000 });
}

try {
  // ---------------------------------------------------------------- public
  for (const [id, p] of [["S01-landing", "/"], ["S02-pricing", "/pricing"], ["S04-templates", "/templates"], ["S03-ats-checker", "/tools/ats-checker"]]) {
    await go(p);
    await shot(id);
    ok(`${id} renders`, (await page.title()).length > 0);
    await axe(id);
  }

  // ---------------------------------------------------------------- sign up (S05)
  const email = `walkthrough+${Date.now()}@example.com`;
  const password = randomBytes(12).toString("base64url");
  await go("/signup");
  await click('button[type="submit"]');
  ok("S05 empty sign-up shows errors", await page.locator("::-p-text(Enter your name.)").wait().then(() => true, () => false));
  await shot("S05-signup-errors");
  await fill("::-p-aria(Your name)", "Riley Walker");
  await fill("::-p-aria(Email)", email);
  await fill("::-p-aria(Password)", password);
  await shot("S05-signup");
  await axe("S05-signup");
  await click('button[type="submit"]');
  ok("sign-up asks to confirm the email", await page.locator("::-p-text(Check your email)").wait().then(() => true, () => false));
  await shot("S05-check-email");
  await axe("S05-check-email");

  // Logging in before confirming says so, and offers to resend.
  expectRefusals = true;
  await go("/login");
  await fill("::-p-aria(Email)", email);
  await fill("::-p-aria(Password)", password);
  await click('button[type="submit"]');
  ok("log in before confirming is refused", await page.locator("::-p-text(Check your email)").wait().then(() => true, () => false));
  expectRefusals = false;

  // Signing up again with the same address gives the same answer (no account probing).
  const again = await page.evaluate(async (body) => (await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status, { fullName: "X", email, password: "another-password-1" });
  ok("sign-up with a taken email looks the same", again === 202, String(again));

  await go(new URL(await emailLink(email, "verify")).pathname + new URL(await emailLink(email, "verify")).search);
  ok("the emailed link confirms and signs in", new URL(page.url()).pathname === "/app", page.url());
  const reused = await page.evaluate(async (u) => (await fetch(u, { redirect: "manual" })).headers.get("location") ?? (await fetch(u)).url, await emailLink(email, "verify"));
  ok("a confirm link works only once", /\/login\?error=link/.test(reused ?? ""), reused);

  // ---------------------------------------------------------------- dashboard empty (S11)
  ok("S11 empty state", await page.locator("::-p-text(No resumes yet)").wait().then(() => true, () => false));
  await shot("S11-dashboard-empty");
  await axe("S11-dashboard-empty");

  // ---------------------------------------------------------------- create (S12)
  await click("::-p-text(Create your first resume)");
  await page.locator('[role="dialog"]').wait();
  await click('[role="dialog"] button[type="submit"]');
  ok("S12 validates", await page.locator("::-p-text(Choose the level closest)").wait().then(() => true, () => false));
  await fill("::-p-aria(Resume name)", "Riley Walker – Data Analyst at Fernway Logistics Group, Austin office");
  // Keyboard, like a keyboard-only user: open the select, type to jump, Enter.
  await page.locator("::-p-aria(Experience level)").setTimeout(5000).wait();
  await page.focus('[role="dialog"] button[role="combobox"]');
  await page.keyboard.press("Enter");
  await page.locator('[role="listbox"]').wait();
  await page.keyboard.type("Junior");
  await page.keyboard.press("Enter");
  ok("experience level picked by keyboard", await page.locator("::-p-text(Junior)").wait().then(() => true, () => false));
  await click("::-p-aria(Tailor it to a job ad)");
  await fill("::-p-aria(Job title)", "Data Analyst");
  await fill("::-p-aria(Company)", "Fernway");
  await fill(
    "::-p-aria(Job ad)",
    "We need a Data Analyst who writes SQL every day, builds dashboards in Tableau, and runs A/B testing with product teams. Python is a plus. You will present findings to stakeholders and need strong communication. Experience with forecasting and Excel expected.",
  );
  await shot("S12-create-resume");
  await axe("S12-create-resume");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), click('[role="dialog"] button[type="submit"]')]);
  ok("create opens the editor on Contact", /\/app\/resume\/[^/]+\/contact$/.test(page.url()), page.url());
  const resumeUrl = page.url().replace(/\/contact$/, "");

  // ---------------------------------------------------------------- contact (S18)
  await fill("::-p-aria(Full name)", "Riley Walker");
  await fill('input[type="email"]', "riley.walker@example.com");
  await fill('input[type="tel"]', "(555) 010-3141");
  await fill("::-p-aria(City)", "Austin");
  await waitSaved();
  ok("contact autosaves", true);
  await shot("S18-contact");
  await axe("S18-contact");

  // ---------------------------------------------------------------- experience (S19)
  await go(resumeUrl.replace(BASE, "") + "/experience");
  await fill("::-p-aria(Job title)", "Junior Data Analyst");
  await fill("::-p-aria(Company)", "Cedar Market");
  await click("::-p-aria(Start month: not set)");
  await click("::-p-aria(Previous year)");
  await click("::-p-aria(Previous year)");
  await click('::-p-aria([name="March 2024"])');
  await click("::-p-aria(End month: not set)");
  await click("::-p-aria(I work here now)");
  await fill("::-p-aria(Bullet 1 of 1)", "i was responsible for the weekly sales report");
  await sleep(400);
  ok("S19 flags the weak bullet", await page.locator("::-p-text(describes a duty)").wait().then(() => true, () => false));
  await click("::-p-text(Suggest with AI)");
  ok("AI suggestion appears", await page.locator("::-p-text(AI suggestion:)").wait().then(() => true, () => false));
  const suggestion = await page.evaluate(() => document.querySelector(".bg-ai-soft p")?.textContent ?? "");
  ok("AI keeps a [placeholder] instead of inventing a result", /\[.+\]/.test(suggestion), suggestion);
  await click("::-p-text(Use this)");
  await page.keyboard.press("End");
  await fill("::-p-aria(Bullet 1 of 1)", "Built a weekly sales report in SQL and Tableau that 12 store managers use, cutting prep time by 5 hours.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Cleaned 3 years of returns data in Python and Excel.");
  await waitSaved();
  await shot("S19-experience");
  await axe("S19-experience");

  // ---------------------------------------------------------------- education, skills, summary (S20-S22)
  await go(resumeUrl.replace(BASE, "") + "/education");
  await fill("::-p-aria(Degree or qualification)", "BS, Statistics");
  await fill("::-p-aria(School, college or university)", "University of Texas at Austin");
  await fill("::-p-aria(Year finished)", "2023");
  await waitSaved();
  await shot("S20-education");
  await go(resumeUrl.replace(BASE, "") + "/skills");
  await fill("::-p-aria(Group name)", "Tools");
  await fill('main input[placeholder^="Figma"]', "SQL, Tableau, Python, Excel, Forecasting, Data cleaning");
  await waitSaved();
  await shot("S21-skills");
  await go(resumeUrl.replace(BASE, "") + "/summary");
  await click("::-p-text(Write a draft)");
  await page.locator("::-p-text(Use this)").wait();
  await shot("S22-summary");
  await click("::-p-text(Use this)");
  await waitSaved();
  await axe("S22-summary");

  // ---------------------------------------------------------------- unknown tab does not loop
  const r = await page.goto(resumeUrl + "/not-a-tab", { waitUntil: "networkidle0" });
  ok("unknown editor tab redirects once to contact", page.url() === resumeUrl + "/contact" && r.ok(), page.url());

  // ---------------------------------------------------------------- finish (S24-S28)
  await go(resumeUrl.replace(BASE, "") + "/finish");
  await shot("S24-finish");
  await axe("S24-finish");
  await click('::-p-aria([name="Job match"][role="tab"])');
  const before = await page.evaluate(() => document.body.innerText.match(/has (\d+) of (\d+) keywords/)?.slice(1).map(Number));
  await click("::-p-text(Yes, draft a bullet)");
  await page.locator("::-p-text(Add to resume)").wait();
  await shot("S26-keywords");
  await click("::-p-text(Add to resume)");
  await sleep(400);
  const after = await page.evaluate(() => document.body.innerText.match(/has (\d+) of (\d+) keywords/)?.slice(1).map(Number));
  ok("adding a keyword bullet raises the match", before && after && after[0] > before[0], `${before} -> ${after}`);
  await click('::-p-aria([name="Design"][role="tab"])');
  await click("::-p-aria(Modern, current)").catch(() => click("::-p-aria(Modern)"));
  await shot("S28-design");
  await click('::-p-aria([name="Score"][role="tab"])');
  await shot("S25-score");
  await waitSaved();

  // ---------------------------------------------------------------- download (S29)
  await click("::-p-text(Download PDF)");
  const confirm = await page.locator("::-p-text(Download anyway)").setTimeout(3000).wait().then(() => true, () => false);
  if (confirm) {
    ok("warns about unfilled [placeholders] before download", true);
    await click("::-p-text(Download anyway)");
  }
  let pdf;
  for (let i = 0; i < 60 && !pdf; i++) {
    await sleep(500);
    pdf = (await readdir(DL)).find((f) => f.endsWith(".pdf"));
  }
  ok("PDF downloads", !!pdf, pdf);
  if (pdf) {
    const buf = await readFile(path.join(DL, pdf));
    ok("file is a real PDF", buf.subarray(0, 5).toString() === "%PDF-", `${buf.length} bytes`);
  }

  // Re-downloading the same revision is free; three changed versions use the quota.
  // The two 402s this provokes are expected, so they're excluded from the console check.
  quotaTest = true;
  const quota = await page.evaluate(async (id) => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const got = await (await fetch(`/api/resumes/${id}`)).json();
      const r1 = await fetch(`/api/resumes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: got.resume.revision, content: { ...got.resume.content, summary: { text: `Version ${i}` } } }),
      });
      const { revision } = await r1.json();
      const r2 = await fetch("/api/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resumeId: id, format: "pdf", revision }) });
      out.push(r2.status);
    }
    return out;
  }, resumeUrl.split("/").pop());
  quotaTest = false;
  ok("free plan stops at 3 PDF downloads", JSON.stringify(quota) === "[200,200,402,402]", JSON.stringify(quota));

  // ---------------------------------------------------------------- free resume limit (S17)
  await go("/app");
  await shot("S11-dashboard");
  await axe("S11-dashboard");
  await click("::-p-text(New resume)");
  ok("S17 upgrade dialog at the resume limit", await page.locator("::-p-text(The free plan includes one resume.)").wait().then(() => true, () => false));
  await shot("S17-upgrade");
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- a second user gets nothing
  const resumeId = resumeUrl.split("/").at(-1);
  const b = await secondUser("b");
  const isolation = [
    await api(b.page, `/api/resumes/${resumeId}`),
    await api(b.page, `/api/resumes/${resumeId}`, { method: "PATCH", body: JSON.stringify({ revision: 1, name: "hacked" }) }),
    await api(b.page, `/api/resumes/${resumeId}`, { method: "DELETE" }),
    await api(b.page, "/api/exports", { method: "POST", body: JSON.stringify({ resumeId, format: "pdf", revision: 1 }) }),
    await api(b.page, "/api/ai/summary", { method: "POST", body: JSON.stringify({ resumeId, position: "x", skills: [] }) }),
  ];
  ok("a second user can't read, change, delete, export or use AI on it", isolation.every((x) => x === 404), JSON.stringify(isolation));
  await b.page.goto(BASE + resumeUrl.replace(BASE, "") + "/contact", { waitUntil: "networkidle0" });
  ok("a second user gets 'not found' for its editor page", await b.page.locator("::-p-text(find that resume)").wait().then(() => true, () => false) || (await b.page.content()).includes("404"));
  const listB = await b.page.evaluate(async () => (await (await fetch("/api/resumes")).json()).resumes.length);
  ok("a second user's list is empty", listB === 0, String(listB));

  // ---------------------------------------------------------------- settings (S14)
  await go("/app/settings");
  await shot("S14-settings");
  await axe("S14-settings");

  // Change email: nothing changes until the link sent to the new address is clicked.
  const newEmail = `walkthrough-new+${Date.now()}@example.com`;
  await click("button::-p-text(Change email)");
  await fill("::-p-aria(New email)", newEmail);
  await click('[role="dialog"] button[type="submit"]');
  ok("change email asks to confirm the new address", await page.locator("::-p-text(Your address changes to)").wait().then(() => true, () => false));
  await go(new URL(await emailLink(newEmail, "change_email")).pathname + new URL(await emailLink(newEmail, "change_email")).search);
  ok("the link changes the email", await page.locator(`::-p-text(${newEmail})`).wait().then(() => true, () => false), page.url());

  // Rate limits: the 11th wrong password for one address in 15 minutes is refused.
  expectRefusals = true;
  const tries = [];
  const nobody = `nobody-${Date.now()}@example.com`;
  for (let i = 0; i < 11; i++) tries.push(await api(page, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: nobody, password: "wrong-password" }) }));
  ok("login is rate limited per address", tries.at(-1) === 429 && tries.slice(0, 10).every((x) => x === 401), JSON.stringify(tries));

  ok("unsigned Stripe webhooks are refused", (await api(page, "/api/webhooks/stripe", { method: "POST", body: "{}" })) === 400);
  ok("cron jobs need the secret", (await api(page, "/api/cron/prune-logs")) === 403);

  // Password reset by email, from a signed-out browser. Other sessions end.
  const c = await browser.createBrowserContext();
  const other = await c.newPage();
  await other.goto(BASE + "/login", { waitUntil: "networkidle0" });
  ok("log in with the new email", (await api(other, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: newEmail, password }) })) === 200);
  await other.goto(BASE + "/forgot-password", { waitUntil: "networkidle0" });
  await other.locator("::-p-aria(Email)").fill(newEmail);
  await other.locator('button[type="submit"]').click();
  await other.locator("::-p-text(Check your email)").wait();
  await other.goto(await emailLink(newEmail, "reset"), { waitUntil: "networkidle0" });
  ok("the reset link opens the new-password form", new URL(other.url()).pathname === "/reset-password" && (await other.locator("::-p-text(Choose a new password)").wait().then(() => true, () => false)));
  const newPassword = randomBytes(12).toString("base64url");
  await other.locator("::-p-aria(New password)").fill(newPassword);
  await Promise.all([other.waitForNavigation({ waitUntil: "networkidle0" }), other.locator('button[type="submit"]').click()]);
  ok("saving the new password signs in", new URL(other.url()).pathname === "/app", other.url());
  await go("/app");
  ok("the reset signed out the other session", new URL(page.url()).pathname === "/login", page.url());
  ok("the old password no longer works", (await api(page, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: newEmail, password }) })) === 401);
  ok("the new password works", (await api(page, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: newEmail, password: newPassword }) })) === 200);

  // Sign out everywhere ends the other browser's session too.
  await go("/app/settings");
  await click("button::-p-text(Sign out everywhere)");
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15_000 });
  await other.goto(BASE + "/app", { waitUntil: "networkidle0" });
  ok("sign out everywhere ends every session", new URL(page.url()).pathname === "/login" && new URL(other.url()).pathname === "/login", `${page.url()} ${other.url()}`);
  await c.close();
  expectRefusals = false;
  await api(page, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: newEmail, password: newPassword }) });

  // ---------------------------------------------------------------- 390px
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  for (const [id, p] of [["S01-landing", "/"], ["S11-dashboard", "/app"], ["S19-experience", resumeUrl.replace(BASE, "") + "/experience"], ["S24-finish", resumeUrl.replace(BASE, "") + "/finish"], ["S14-settings", "/app/settings"]]) {
    await go(p);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) problems.overflow.push(`${id}: ${over}px wider than the screen`);
    await shot(`${id}-390`);
  }
  ok("no sideways scrolling at 390px", problems.overflow.length === 0, problems.overflow.join("; "));

  // ---------------------------------------------------------------- delete account
  await page.setViewport({ width: 1440, height: 900 });
  const del = await api(page, "/api/me", { method: "DELETE", body: JSON.stringify({ confirmEmail: newEmail }) });
  ok("delete account", del === 204, String(del));
  expectRefusals = true;
  ok("a deleted account can't log in", (await api(page, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: newEmail, password: newPassword }) })) === 401);
  const leftovers = JSON.parse(await readFile(path.join(process.cwd(), ".data", "db.json"), "utf8"));
  ok("nothing of the deleted account is left", !JSON.stringify(leftovers).includes(resumeId), resumeId);
  await b.ctx.close();
} catch (e) {
  ok("walkthrough finished without crashing", false, e.message);
  await page.screenshot({ path: path.join(OUT, "_crash.png") }).catch(() => {});
} finally {
  await browser.close();
}

const real = problems.console.filter((c) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(c));
ok("no console errors", real.length === 0, real.slice(0, 5).join(" | "));
ok("no axe violations", problems.axe.length === 0, problems.axe.slice(0, 8).join(" | "));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots in replica/clone-screens/`);
process.exit(failed ? 1 : 0);
