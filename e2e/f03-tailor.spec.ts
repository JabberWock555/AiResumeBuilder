// F03: tailor a resume to a job ad (S12 target → S24/S26 keyword card).
import { test, expect, createResume, baseURL, saved, secondUser, JOB_AD } from "./helpers";

async function resumeWithRole(page: import("@playwright/test").Page, target = true) {
  const id = await createResume(page.request, baseURL(page), target ? { target: { title: "Data Analyst", company: "Fernway", description: JOB_AD } } : {});
  await page.goto(`/app/resume/${id}/experience`);
  await page.getByLabel("Job title").fill("Junior Data Analyst");
  await page.getByLabel("Company").fill("Cedar Market");
  await page.getByLabel("Bullet 1 of 1").fill("Built a weekly sales report in SQL that 12 store managers use.");
  await saved(page);
  return id;
}

const matchCount = async (page: import("@playwright/test").Page) => {
  const t = await page.getByText(/Your resume has \d+ of \d+ keywords/).innerText();
  const [, a, b] = t.match(/has (\d+) of (\d+)/)!;
  return [Number(a), Number(b)] as const;
};

test.describe("F03 tailor to a job", () => {
  test("F03-H1 add a bullet for a missing keyword; the match goes up and never invents numbers", async ({ page, axe, newUser }) => {
    await newUser(page);
    const id = await resumeWithRole(page);
    await page.goto(`/app/resume/${id}/finish`);
    await page.getByRole("tab", { name: "Job match" }).click();
    await axe(page, "S26 keywords");
    const before = await matchCount(page);
    await page.getByRole("button", { name: "Yes, draft a bullet" }).click();
    const draft = page.getByLabel("Bullet");
    await expect(draft).not.toHaveValue("");
    // Any number in the draft must be one the user wrote (12) or a placeholder.
    const text = await draft.inputValue();
    for (const n of text.match(/\d[\d,.]*/g) ?? []) expect(["12"]).toContain(n);
    await page.getByRole("button", { name: "Add to resume" }).click();
    await expect.poll(async () => (await matchCount(page))[0]).toBeGreaterThan(before[0]);
    await saved(page);
  });

  test("F03-H2 add a job ad later from the finish page", async ({ page, newUser }) => {
    await newUser(page);
    const id = await resumeWithRole(page, false);
    await page.goto(`/app/resume/${id}/finish`);
    await page.getByRole("tab", { name: "Job match" }).click();
    await page.getByRole("button", { name: "Add a job ad" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Job title").fill("Data Analyst");
    await d.getByLabel("Job ad").fill(JOB_AD);
    await d.getByRole("button", { name: "Check keywords" }).click();
    await expect(page.getByText(/Your resume has \d+ of \d+ keywords/)).toBeVisible();
  });

  test("F03-E1 'No, not relevant' removes a keyword from the count and stays after reload", async ({ page, newUser }) => {
    await newUser(page);
    const id = await resumeWithRole(page);
    await page.goto(`/app/resume/${id}/finish`);
    await page.getByRole("tab", { name: "Job match" }).click();
    const [, total] = await matchCount(page);
    await page.getByRole("button", { name: "No, not relevant" }).click();
    await expect.poll(async () => (await matchCount(page))[1]).toBe(total - 1);
    await page.reload();
    await page.getByRole("tab", { name: "Job match" }).click();
    await expect.poll(async () => (await matchCount(page))[1]).toBe(total - 1);
  });

  test("F03-E2 job ad too short, or too long, is refused with a reason", async ({ page, allow, newUser }) => {
    allow(/status of 400/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    const short = await page.request.put(`/api/resumes/${id}/target`, { data: { title: "X", description: "too short" } });
    expect(short.status()).toBe(400);
    const long = await page.request.put(`/api/resumes/${id}/target`, { data: { title: "X", description: "word ".repeat(5000) } });
    expect(long.status()).toBe(400);
    const ok = await page.request.put(`/api/resumes/${id}/target`, { data: { title: "Analyst ✨ São Paulo", description: `${JOB_AD} Ünïcödé 😀` } });
    expect(ok.status()).toBe(200);
  });

  test("F03-E3 the job match score agrees with the keyword panel", async ({ page, newUser }) => {
    await newUser(page);
    const id = await resumeWithRole(page);
    await page.goto(`/app/resume/${id}/finish`);
    await page.getByRole("tab", { name: "Job match" }).click();
    const [m, t] = await matchCount(page);
    await page.getByRole("tab", { name: "Score" }).click();
    const jobScore = Number(await page.getByRole("meter", { name: "Job match score" }).getAttribute("aria-valuenow"));
    if (m < t) expect(jobScore).toBeLessThan(100);
  });

  test("F03-N1 another user can't read, change or remove this job ad", async ({ page, browser, newUser }) => {
    await newUser(page);
    const id = await resumeWithRole(page);
    const b = await secondUser(browser);
    expect((await b.request.get(`/api/resumes/${id}`)).status()).toBe(404);
    expect((await b.request.put(`/api/resumes/${id}/target`, { data: { title: "X", description: JOB_AD } })).status()).toBe(404);
    expect((await b.request.delete(`/api/resumes/${id}/target`)).status()).toBe(404);
    expect((await b.request.post(`/api/resumes/${id}/target/dismiss`, { data: { term: "SQL" } })).status()).toBe(404);
    expect((await b.request.post("/api/ai/keyword-bullet", { data: { resumeId: id, term: "SQL" } })).status()).toBe(404);
    await b.ctx.close();
  });
});
