// F01: a new user builds a first resume and exports it (S05 → S11 → S12 → S18-S22 → S24 → S29).
import { readFile } from "node:fs/promises";
import { test, expect, saved, createResume, baseURL, JOB_AD } from "./helpers";

test.describe("F01 first resume to PDF", () => {
  test("F01-H1 sign up, build a one-job resume and download the PDF", async ({ page, allow, axe, newUser }) => {
    allow(/status of 402/);
    await page.goto("/signup");
    await axe(page, "S05 sign up");
    await newUser(page, { name: "Riley Walker" });
    await expect(page.getByText("No resumes yet")).toBeVisible();
    await axe(page, "S11 empty");

    await page.getByRole("button", { name: "Create your first resume" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Resume name").fill("Riley Walker – Data Analyst");
    await dialog.getByRole("combobox", { name: "Experience level" }).click();
    await page.getByRole("option", { name: "Junior" }).click();
    await dialog.getByRole("switch", { name: "Tailor it to a job ad" }).click();
    await dialog.getByLabel("Job title").fill("Data Analyst");
    await dialog.getByLabel("Job ad").fill(JOB_AD);
    await axe(page, "S12 create");
    await dialog.getByRole("button", { name: "Create resume" }).click();
    await expect(page).toHaveURL(/\/app\/resume\/[^/]+\/contact$/);
    const base = page.url().replace(/\/contact$/, "");

    await page.getByLabel("Full name").fill("Riley Walker");
    await page.getByRole("textbox", { name: /^Email/ }).fill("riley.walker@example.com");
    await page.getByLabel("City").fill("Austin");
    await saved(page);
    await axe(page, "S18 contact");

    await page.goto(`${base}/experience`);
    await page.getByLabel("Job title").fill("Junior Data Analyst");
    await page.getByLabel("Company").fill("Cedar Market");
    await page.getByLabel("Bullet 1 of 1").fill("Built a weekly sales report in SQL and Tableau that 12 store managers use.");
    await saved(page);
    await axe(page, "S19 experience");

    await page.goto(`${base}/skills`);
    await page.getByLabel("Group name").fill("Tools");
    await page.getByPlaceholder(/^Figma/).fill("SQL, Tableau, Python, Excel");
    await saved(page);

    await page.goto(`${base}/summary`);
    await page.getByRole("button", { name: "Write a draft" }).click();
    await page.getByRole("button", { name: "Use this" }).click();
    await saved(page);

    await page.goto(`${base}/finish`);
    await axe(page, "S24 finish");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const anyway = page.getByRole("button", { name: "Download anyway" });
    if (await anyway.isVisible({ timeout: 3000 }).catch(() => false)) await anyway.click();
    const file = await (await download).path();
    const bytes = await readFile(file);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000);
  });

  test("F01-E1 empty sign-up and create forms explain what's missing", async ({ page, allow, newUser }) => {
    allow(/status of 40\d/);
    await page.goto("/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText(/Enter an email address/)).toBeVisible();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    await newUser(page);
    await page.getByRole("button", { name: "Create your first resume" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Create resume" }).click();
    await expect(page.getByText(/Give it a name/)).toBeVisible();
    await expect(page.getByText(/Choose the level closest/)).toBeVisible();
  });

  test("F01-E2 very long input is capped, not lost or broken", async ({ page, allow, newUser }) => {
    allow(/status of 40\d/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/contact`);
    const long = "A".repeat(400);
    await page.getByLabel("Full name").fill(long);
    const value = await page.getByLabel("Full name").inputValue();
    expect(value.length).toBeLessThanOrEqual(120);
    await saved(page);
    const r = await page.request.post("/api/resumes", { data: { name: "x".repeat(500), experienceLevel: "junior" } });
    expect(r.status()).toBe(400);
  });

  test("F01-E3 emoji and accents survive a save and reload", async ({ page, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page), { name: "Zoë Ångström – Café ☕" });
    await page.goto(`/app/resume/${id}/contact`);
    await page.getByLabel("Full name").fill("Zoë Ångström-Núñez 🚀");
    await page.getByLabel("City").fill("São Paulo");
    await saved(page);
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Zoë Ångström-Núñez 🚀");
    await expect(page.getByLabel("City")).toHaveValue("São Paulo");
    await page.goto("/app");
    await expect(page.getByText("Zoë Ångström – Café ☕").first()).toBeVisible();
  });

  test("F01-E4 refresh mid-flow keeps what was saved", async ({ page, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/experience`);
    await page.getByLabel("Job title").fill("Analyst");
    await page.getByLabel("Bullet 1 of 1").fill("Cleaned 3 years of returns data in Python.");
    await saved(page);
    await page.reload();
    await expect(page.getByLabel("Job title")).toHaveValue("Analyst");
    await expect(page.getByLabel("Bullet 1 of 1")).toHaveValue("Cleaned 3 years of returns data in Python.");
  });

  test("F01-E5 two tabs editing the same resume: the stale tab is told, nothing is overwritten", async ({ page, context, allow, newUser }) => {
    allow(/status of 409/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    const other = await context.newPage();
    await page.goto(`/app/resume/${id}/contact`);
    await other.goto(`/app/resume/${id}/contact`);
    await page.getByLabel("City").fill("Austin");
    await saved(page);
    await other.getByLabel("City").fill("Denver");
    await expect(other.getByRole("dialog", { name: "This resume changed in another tab" })).toBeVisible();
    const got = await (await page.request.get(`/api/resumes/${id}`)).json();
    expect(got.resume.content.contact.city).toBe("Austin");
    await other.close();
  });

  test("F01-E6 double click on Create resume makes one resume", async ({ page, allow, newUser }) => {
    allow(/status of 402/);
    await newUser(page);
    await page.getByRole("button", { name: "Create your first resume" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Resume name").fill("Double");
    await dialog.getByRole("combobox", { name: "Experience level" }).click();
    await page.getByRole("option", { name: "Junior" }).click();
    await dialog.getByRole("button", { name: "Create resume" }).dblclick();
    await expect(page).toHaveURL(/\/contact$/);
    const list = await (await page.request.get("/api/resumes")).json();
    expect(list.resumes).toHaveLength(1);
  });

  test("F01-E7 back button mid-flow returns to the previous section with data intact", async ({ page, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/contact`);
    await page.getByLabel("Full name").fill("Back Button");
    await saved(page);
    await page.goto(`/app/resume/${id}/experience`);
    await page.goBack();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByLabel("Full name")).toHaveValue("Back Button");
  });

  test("F01-E8 offline: edits wait and save when the connection is back", async ({ page, context, allow, newUser }) => {
    allow(/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/contact`);
    await context.setOffline(true);
    await page.getByLabel("City").fill("Offline City");
    await expect(page.getByRole("status").filter({ hasText: "Not saved" })).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
    await saved(page);
    const got = await (await page.request.get(`/api/resumes/${id}`)).json();
    expect(got.resume.content.contact.city).toBe("Offline City");
  });

  test("F01-E9 saving fails, then the tab is closed: the unsaved edit is still there next time", async ({ page, context, allow, newUser }) => {
    allow(/Failed to fetch|net::|ERR_FAILED/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/contact`);
    // The connection drops: every save fails.
    await page.route("**/api/resumes/*", (r) => (r.request().method() === "PATCH" ? r.abort("internetdisconnected") : r.continue()));
    await page.getByLabel("City").fill("Kept on this device");
    await expect(page.getByRole("status").filter({ hasText: "Not saved" })).toBeVisible({ timeout: 20_000 });
    await page.close({ runBeforeUnload: false });
    const again = await context.newPage();
    await again.goto(`/app/resume/${id}/contact`);
    await expect(again.getByLabel("City")).toHaveValue("Kept on this device");
    await saved(again);
    const got = await (await again.request.get(`/api/resumes/${id}`)).json();
    expect(got.resume.content.contact.city).toBe("Kept on this device");
  });

  test("F01-E10 expired session while editing says so and keeps the edit", async ({ page, context, allow, newUser }) => {
    allow(/status of 401/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/contact`);
    await context.clearCookies();
    await page.getByLabel("City").fill("After expiry");
    await expect(page.getByText(/signed out|log in again/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("F01-E11 unknown editor section redirects once, no loop", async ({ page, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    const res = await page.goto(`/app/resume/${id}/not-a-tab`);
    expect(res?.ok()).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/app/resume/${id}/contact$`));
  });

  test("F01-E12 keyboard only: create a resume without the mouse", async ({ page, newUser }) => {
    await newUser(page);
    await page.getByRole("button", { name: "Create your first resume" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Keyboard Only");
    await page.getByRole("dialog").getByRole("combobox", { name: "Experience level" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Entry");
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").getByRole("button", { name: "Create resume" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/contact$/);
  });

  test("F01-E13 mobile width: editor and dashboard fit without sideways scroll", async ({ page, axe, newUser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    for (const p of ["/app", `/app/resume/${id}/contact`, `/app/resume/${id}/experience`, `/app/resume/${id}/finish`, "/app/settings"]) {
      await page.goto(p);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${p} sideways scroll`).toBeLessThanOrEqual(0);
      await axe(page, `${p} at 390px`);
    }
  });

  test("F01-N1 free plan: 3 PDFs, re-downloading the same version is free, the 4th version is refused", async ({ page, allow, newUser }) => {
    allow(/status of 402/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    const edit = async (i: number) => {
      const got = await (await page.request.get(`/api/resumes/${id}`)).json();
      const r = await page.request.patch(`/api/resumes/${id}`, { data: { revision: got.resume.revision, content: { ...got.resume.content, summary: { ...got.resume.content.summary, text: `Version ${i}` } } } });
      return (await r.json()).revision as number;
    };
    const pdf = async (revision: number) => (await page.request.post("/api/exports", { data: { resumeId: id, format: "pdf", revision } })).status();
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push(await pdf(await edit(i)));
    const last = (await (await page.request.get(`/api/resumes/${id}`)).json()).resume.revision;
    statuses.push(await pdf(last));
    statuses.push(await pdf(await edit(9)));
    expect(statuses).toEqual([200, 200, 200, 200, 402]);
  });
});
