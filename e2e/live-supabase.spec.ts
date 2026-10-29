// Opt-in smoke test against the real Supabase project (your .env.local), with
// the seeded demo account (npm run seed -- --supabase). Start the plain "web"
// launch config, then: npm run e2e:live
// Uses one of the demo account's free PDF downloads per new revision.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.skip(!process.env.LIVE_SUPABASE, "set LIVE_SUPABASE=1 (npm run e2e:live) to run against the real project");

test("live Supabase: log in, edit, autosave, reload, PDF", async ({ page }) => {
  const seed = await readFile("scripts/seed.mjs", "utf8");
  const email = seed.match(/const EMAIL = "([^"]+)"/)![1];
  const password = seed.match(/const PASSWORD = "([^"]+)"/)![1];
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await expect(page.getByText("Jordan Lee – Product Designer").first()).toBeVisible();
  const cookies = await page.context().cookies();
  const sb = cookies.filter((c) => c.name.startsWith("sb-"));
  expect(sb.length).toBeGreaterThan(0);
  expect(sb.every((c) => c.httpOnly)).toBe(true);

  const list = await (await page.request.get("/api/resumes")).json();
  const id = list.resumes[0].id;
  await page.goto(`/app/resume/${id}/contact`);
  await page.waitForLoadState("networkidle");
  const city = `Portland ${Date.now() % 1000}`;
  await page.getByLabel("City").fill(city);
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByLabel("City")).toHaveValue(city);

  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.email).toBe(email);
  const got = await (await page.request.get(`/api/resumes/${id}`)).json();
  const pdf = await page.request.post("/api/exports", { data: { resumeId: id, format: "pdf", revision: got.resume.revision } });
  // 402 once the demo account has used its 3 free downloads: still a correct answer.
  expect([200, 402]).toContain(pdf.status());
  if (pdf.status() === 200) {
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const again = await page.request.post("/api/exports", { data: { resumeId: id, format: "pdf", revision: got.resume.revision } });
    expect(again.headers()["x-downloads-left"]).toBe("unchanged");
  }
  expect(errors, "console errors or 5xx").toEqual([]);
});
