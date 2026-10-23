// F08: manage resumes on the dashboard (S11): sort, grid/list, rename, copy, delete.
import { test, expect, createResume, baseURL, makePro, secondUser } from "./helpers";

test.describe("F08 manage resumes", () => {
  test("F08-H1 rename, make a copy and delete from the card menu", async ({ page, axe, newUser }) => {
    await newUser(page);
    await makePro(page);
    await createResume(page.request, baseURL(page), { name: "Original" });
    await page.goto("/app");
    await axe(page, "S11 dashboard");

    await page.getByRole("button", { name: "Actions for Original" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("Renamed ✓");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Renamed ✓").first()).toBeVisible();

    await page.getByRole("button", { name: "Actions for Renamed ✓" }).click();
    await page.getByRole("menuitem", { name: "Make a copy" }).click();
    // The copy opens in the editor, ready to tailor.
    await expect(page).toHaveURL(/\/app\/resume\/[^/]+\/contact$/);
    await expect(page.getByText("Renamed ✓ (copy)").first()).toBeVisible();
    await page.goto("/app");

    await page.getByRole("button", { name: "Actions for Renamed ✓ (copy)" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete resume" }).click();
    await expect(page.getByText("Renamed ✓ (copy)")).toHaveCount(0);
    expect((await (await page.request.get("/api/resumes")).json()).resumes).toHaveLength(1);
  });

  test("F08-H2 sort by name and switch to list view; both are remembered", async ({ page, newUser }) => {
    await newUser(page);
    await makePro(page);
    for (const n of ["Bravo", "Alpha", "Charlie"]) await createResume(page.request, baseURL(page), { name: n });
    await page.goto("/app?sort=name");
    const names = await page.getByRole("button", { name: /^Actions for / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names).toEqual(["Actions for Alpha", "Actions for Bravo", "Actions for Charlie"]);
    await page.getByRole("radio", { name: "List" }).click();
    await page.reload();
    await expect(page.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  });

  test("F08-E1 free plan: making a copy at the limit opens the upgrade dialog", async ({ page, allow, newUser }) => {
    allow(/status of 402/);
    await newUser(page);
    await createResume(page.request, baseURL(page), { name: "Only one" });
    await page.goto("/app");
    await page.getByRole("button", { name: "Actions for Only one" }).click();
    await page.getByRole("menuitem", { name: "Make a copy" }).click();
    await expect(page.getByRole("dialog", { name: "Upgrade to Pro" })).toBeVisible();
  });

  test("F08-N1 a deleted resume is gone everywhere: editor, API, export", async ({ page, allow, newUser }) => {
    allow(/status of 404/);
    // Development-only message from Next when it renders a not-found page from a layout;
    // the production build doesn't log it (checked with `next start`).
    allow(/Encountered a script tag while rendering React component/);
    await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    expect((await page.request.delete(`/api/resumes/${id}`)).status()).toBe(204);
    await page.goto(`/app/resume/${id}/contact`);
    await expect(page.getByRole("heading", { name: /can’t find that resume/ })).toBeVisible();
    expect((await page.request.get(`/api/resumes/${id}`)).status()).toBe(404);
    expect((await page.request.post("/api/exports", { data: { resumeId: id, format: "pdf", revision: 1 } })).status()).toBe(404);
  });

  test("F08-N2 a second user sees none of the first user's resumes", async ({ page, browser, newUser }) => {
    await newUser(page);
    const id = await createResume(page.request, baseURL(page), { name: "Private resume" });
    const b = await secondUser(browser);
    await b.page.goto("/app");
    await expect(b.page.getByText("Private resume")).toHaveCount(0);
    const statuses = [
      (await b.request.get(`/api/resumes/${id}`)).status(),
      (await b.request.patch(`/api/resumes/${id}`, { data: { revision: 1, name: "hacked" } })).status(),
      (await b.request.delete(`/api/resumes/${id}`)).status(),
      (await b.request.post(`/api/resumes/${id}/duplicate`, { data: {} })).status(),
      (await b.request.post("/api/exports", { data: { resumeId: id, format: "pdf", revision: 1 } })).status(),
      (await b.request.post("/api/ai/bullet", { data: { resumeId: id, entryId: "x", mode: "suggest" } })).status(),
    ];
    expect(statuses).toEqual([404, 404, 404, 404, 404, 404]);
    await b.page.goto(`/app/resume/${id}/contact`);
    await expect(b.page.getByRole("heading", { name: /can’t find that resume/ })).toBeVisible();
    await b.ctx.close();
    expect((await (await page.request.get(`/api/resumes/${id}`)).json()).resume.name).toBe("Private resume");
  });
});
