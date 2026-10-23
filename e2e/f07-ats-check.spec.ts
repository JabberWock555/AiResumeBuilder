// F07: anonymous ATS check (S03). Only the public page exists so far (could-have, M4).
import { test, expect } from "./helpers";

test("F07-H1 the ATS checker page renders and is accessible", async ({ page, axe }) => {
  await page.goto("/tools/ats-checker");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await axe(page, "S03 ATS checker");
});

test("F07-E1 public pages render for a signed-out visitor", async ({ page, axe }) => {
  for (const p of ["/", "/pricing", "/templates", "/privacy"]) {
    const r = await page.goto(p);
    expect(r?.status(), p).toBe(200);
    await axe(page, p);
  }
});
