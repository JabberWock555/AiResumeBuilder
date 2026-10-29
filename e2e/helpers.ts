import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Shared fixtures for every spec:
// - fails the test on any console error or 5xx response, except refusals a
//   test asks for on purpose (`allow(/regex/)`), e.g. a 401 for a wrong password;
// - `axe(page, label)` scans the page and fails on any WCAG A/AA violation;
// - `newUser()` signs up and confirms a fresh account through the emailed link.

type Fixtures = {
  allow: (re: RegExp) => void;
  axe: (page: Page, label: string) => Promise<void>;
  newUser: (page: Page, opts?: { name?: string }) => Promise<{ email: string; password: string; name: string }>;
};

export const test = base.extend<Fixtures>({
  allow: async ({ page }, provide) => {
    const allowed: RegExp[] = [];
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      if (/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(text)) return;
      if (allowed.some((re) => re.test(text))) return;
      problems.push(`console: ${text}`);
    });
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 500 && !allowed.some((re) => re.test(`${r.status()} ${r.url()}`))) problems.push(`${r.status()} on ${r.url()}`);
    });
    await provide((re) => allowed.push(re));
    expect(problems, "console errors or 5xx responses").toEqual([]);
  },

  axe: async ({}, provide) => {
    await provide(async (page, label) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const v = r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(" ")}`);
      expect(v, `axe violations on ${label}`).toEqual([]);
    });
  },

  newUser: async ({}, provide) => {
    await provide(async (page, opts = {}) => {
      const email = `e2e-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
      const password = randomBytes(12).toString("base64url");
      const name = opts.name ?? "Avery Quinn";
      const res = await page.request.post("/api/auth/signup", { data: { fullName: name, email, password }, headers: { origin: baseURL(page) } });
      expect(res.status()).toBe(202);
      await page.goto(await emailLink(email, "verify"));
      await expect(page).toHaveURL(/\/app(\?|$)/);
      // Clicks before the page has hydrated do nothing; wait until it has.
      await page.waitForLoadState("networkidle");
      return { email, password, name };
    });
  },
});

export { expect };

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const baseURL = (page: Page) => new URL(page.url() === "about:blank" ? BASE : page.url()).origin;

/** The link in the newest email of a kind sent to an address (local outbox). */
export async function emailLink(to: string, tag: "verify" | "reset" | "change_email" | "account_exists" | "payment_failed") {
  for (let i = 0; i < 40; i++) {
    const raw = await readFile(path.join(process.cwd(), ".data", "outbox.jsonl"), "utf8").catch(() => "");
    const mail = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === to && m.tag === tag).at(-1);
    const link = mail?.text.match(/https?:\/\/\S+/g)?.find((u: string) => u.includes("/auth/confirm") || tag === "account_exists" || tag === "payment_failed");
    if (link) return link as string;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`no ${tag} email for ${to}`);
}

export async function emailsTo(to: string) {
  const raw = await readFile(path.join(process.cwd(), ".data", "outbox.jsonl"), "utf8").catch(() => "");
  return raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === to);
}

/** Creates a resume through the API and returns its id. */
export async function createResume(request: APIRequestContext, origin: string, body: Record<string, unknown> = {}) {
  const res = await request.post("/api/resumes", {
    data: { name: "E2E – Data Analyst", experienceLevel: "junior", language: "en-US", ...body },
    headers: { origin },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id as string;
}

export const JOB_AD =
  "We need a Data Analyst who writes SQL every day, builds dashboards in Tableau, and runs A/B testing with product teams. Python is a plus. You will present findings to stakeholders and need strong communication. Experience with forecasting and Excel expected.";

/** Waits for the editor's save indicator to say Saved. */
export async function saved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^Saved$|Saved/ }).first()).toBeVisible({ timeout: 15_000 });
}

/** A second, confirmed account in its own browser context (separate cookies). */
export async function secondUser(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const email = `e2e-b-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
  const res = await ctx.request.post("/api/auth/signup", { data: { fullName: "Second User", email, password: randomBytes(12).toString("base64url") } });
  expect(res.status()).toBe(202);
  await page.goto(await emailLink(email, "verify"));
  await expect(page).toHaveURL(/\/app(\?|$)/);
  return { ctx, page, request: ctx.request, email };
}

/**
 * Puts the signed-in user on a plan by sending a signed Razorpay webhook to
 * the local server, the same way Razorpay would. Needs the dev server started
 * with the local-only secret and no Razorpay API keys (the "web-webhook-test"
 * launch config does both).
 */
export const WEBHOOK_SECRET = "local_razorpay_webhook_check_only";
export async function sendRazorpayEvent(request: APIRequestContext, event: string, payload: Record<string, unknown>) {
  const { createHmac } = await import("node:crypto");
  const body = JSON.stringify({ entity: "event", event, payload, created_at: Math.floor(Date.now() / 1000) });
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const res = await request.post("/api/webhooks/razorpay", {
    data: body,
    headers: { "x-razorpay-signature": signature, "x-razorpay-event-id": `evt_e2e_${Date.now()}_${randomBytes(4).toString("hex")}`, "content-type": "application/json" },
  });
  expect(res.status(), "start the dev server with the web-webhook-test launch config (see e2e/helpers.ts)").toBe(200);
  return res.json();
}

export function subscription(userId: string, over: Record<string, unknown> = {}) {
  return {
    subscription: {
      entity: {
        id: `sub_e2e${userId.slice(0, 8)}`, entity: "subscription", plan_id: "plan_e2e_month", customer_id: `cust_e2e${userId.slice(0, 8)}`,
        status: "active", current_end: Math.floor(Date.now() / 1000) + 30 * 86400, notes: { user_id: userId, plan: "month" },
        ...over,
      },
    },
  };
}

export async function makePro(page: Page) {
  const me = await (await page.request.get("/api/me")).json();
  await sendRazorpayEvent(page.request, "subscription.activated", subscription(me.user.id));
  return me.user.id as string;
}
