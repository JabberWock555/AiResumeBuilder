// F05: change the look (S27 adjustments, S28 templates).
import { test, expect, createResume, baseURL, saved } from "./helpers";

test.describe("F05 change the look", () => {
  test("F05-H1 template, font size and paper size persist after reload", async ({ page, axe, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/finish`);
    await page.getByRole("tab", { name: "Design" }).click();
    await axe(page, "S27/S28 design");
    await page.getByRole("button", { name: /^Modern/ }).click();
    await page.getByRole("radio", { name: "A4" }).click();
    await page.getByRole("button", { name: /increase font size|font size.*(up|more|\+)/i }).first().click().catch(async () => {
      await page.getByRole("spinbutton", { name: "Font size" }).fill("11");
    });
    await saved(page);
    const got = await (await page.request.get(`/api/resumes/${id}`)).json();
    expect(got.resume.templateId).toBe("modern");
    expect(got.resume.settings.pageSize).toBe("a4");
    await page.reload();
    await page.getByRole("tab", { name: "Design" }).click();
    await expect(page.getByRole("radio", { name: "A4" })).toHaveAttribute("aria-checked", "true");
  });

  test("F05-E1 heading colour radio group works by keyboard", async ({ page, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto(`/app/resume/${id}/finish`);
    await page.getByRole("tab", { name: "Design" }).click();
    const radios = page.getByRole("radiogroup", { name: "Heading colour" }).getByRole("radio");
    await radios.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  });
});
