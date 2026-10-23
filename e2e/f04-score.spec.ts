// F04: raise the score (S19 improvements panel, S25 report).
import { test, expect, createResume, baseURL, saved } from "./helpers";

test.describe("F04 raise the score", () => {
  test("F04-H1 the score rises as the resume is filled and the report links to the entry", async ({ page, axe, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/contact`);
    const score = () => page.getByRole("meter", { name: "Resume score" }).first().getAttribute("aria-valuenow").then(Number);
    const start = await score();
    await page.getByLabel("Full name").fill("Score Climber");
    await page.getByRole("textbox", { name: /^Email/ }).fill("climber@example.com");
    await saved(page);
    await page.goto(`/app/resume/${id}/experience`);
    await page.getByLabel("Job title").fill("Analyst");
    await page.getByLabel("Company").fill("Northwind");
    await page.getByLabel("Bullet 1 of 1").fill("Cut report preparation time by 5 hours a week by automating it in Python.");
    await saved(page);
    await expect.poll(score).toBeGreaterThan(start);
    await page.goto(`/app/resume/${id}/finish`);
    await page.getByRole("tab", { name: "Score" }).click();
    await axe(page, "S25 score");
  });

  test("F04-E1 a weak bullet is flagged, and fixing it clears the flag", async ({ page, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/experience`);
    await page.getByLabel("Job title").fill("Analyst");
    const bullet = page.getByLabel("Bullet 1 of 1");
    await bullet.fill("i was responsible for the weekly sales report");
    await expect(page.getByText(/describes a duty/).first()).toBeVisible();
    await bullet.fill("Built the weekly sales report used by 12 store managers.");
    await expect(page.getByText(/describes a duty/)).toHaveCount(0);
  });
});
