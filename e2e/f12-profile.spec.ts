// F12 (ours): the saved profile. Set up once (upload a resume or fill it in),
// edit it any time, and start each new resume from it with only the job ad.
import path from "node:path";
import { test, expect, saved, secondUser, JOB_AD } from "./helpers";

const fixture = (f: string) => path.join(process.cwd(), "e2e", "fixtures", f);

test.describe("F12 saved profile", () => {
  test("F12-H1 set up by uploading a PDF resume, then check it in the editor", async ({ page, axe, newUser }) => {
    await newUser(page);
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Enter your details once" })).toBeVisible();
    await page.getByRole("link", { name: "Set up your profile" }).click();
    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
    await axe(page, "profile setup");
    await page.getByLabel("Resume file (PDF or Word)").setInputFiles(fixture("sample-resume.pdf"));
    await expect(page.getByText(/We found 2 roles, 1 school, 6 skills, a summary/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Full name")).toHaveValue("Priya Raman");
    await expect(page.getByRole("textbox", { name: /^Email/ })).toHaveValue("priya.raman@example.com");
    await saved(page);
    await axe(page, "profile editor");
    await page.getByRole("link", { name: "Experience" }).click();
    // Filled entries start collapsed: their summary line shows what was read.
    await expect(page.getByText("Northwind Retail · Jan 2022 – Present")).toBeVisible();
    await expect(page.getByText("Fernway Logistics · Jul 2020 – Dec 2021")).toBeVisible();
    // Saved: still there after a reload, and the import used one of the free three.
    await page.reload();
    await expect(page.getByText("Northwind Retail · Jan 2022 – Present")).toBeVisible();
    const me = await (await page.request.get("/api/me")).json();
    expect(me.usage.import.used).toBe(1);
  });

  test("F12-H2 a Word (.docx) resume works too", async ({ page, newUser }) => {
    await newUser(page);
    await page.goto("/app/profile");
    await page.getByLabel("Resume file (PDF or Word)").setInputFiles(fixture("sample-resume.docx"));
    await expect(page.getByText(/We found 2 roles/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Full name")).toHaveValue("Priya Raman");
  });

  test("F12-H3 new resume from the profile asks only for the job", async ({ page, newUser }) => {
    await newUser(page, { name: "Avery Quinn" });
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Start with a blank profile" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Avery Quinn");
    await page.getByLabel("City").fill("Pune");
    await page.getByRole("combobox", { name: "Experience level" }).click();
    await page.getByRole("option", { name: "Associate" }).click();
    await page.getByRole("link", { name: "Experience" }).click();
    await page.getByLabel("Job title").fill("Analyst");
    await page.getByLabel("Company").fill("Northwind");
    await page.getByLabel("Bullet 1 of 1").fill("Built the weekly sales report in SQL used by 12 managers.");
    await saved(page);

    await page.getByRole("link", { name: "New resume for a job" }).click();
    const dialog = page.getByRole("dialog", { name: "New resume" });
    await expect(dialog.getByRole("radio", { name: /Start from my profile/ })).toBeChecked();
    // Only the job: no name or level needed.
    await expect(dialog.getByRole("combobox", { name: "Experience level" })).toHaveCount(0);
    await dialog.getByRole("textbox", { name: /^Job title/ }).fill("Data Analyst");
    await dialog.getByRole("textbox", { name: /^Company/ }).fill("Fernway");
    await dialog.getByRole("textbox", { name: /^Job ad/ }).fill(JOB_AD);
    await dialog.getByRole("button", { name: "Create resume" }).click();
    // Straight to the job match: the details are already there.
    await expect(page).toHaveURL(/\/app\/resume\/[^/]+\/finish#keywords$/);
    await expect(page.getByText(/Your resume has \d+ of \d+ keywords/)).toBeVisible();
    const id = page.url().split("/resume/")[1].split("/")[0];
    const got = await (await page.request.get(`/api/resumes/${id}`)).json();
    expect(got.resume.name).toBe("Avery Quinn – Data Analyst at Fernway");
    expect(got.resume.experienceLevel).toBe("associate");
    expect(got.resume.content.contact.city).toBe("Pune");
    expect(got.resume.content.sections[0].entries[0].role).toBe("Analyst");
  });

  test("F12-E1 changing the profile later doesn't alter resumes already made", async ({ page, newUser }) => {
    await newUser(page);
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Start with a blank profile" }).click();
    await page.getByLabel("City").fill("Before");
    await saved(page);
    const r = await page.request.post("/api/resumes", { data: { target: { title: "Analyst", company: "", description: JOB_AD } } });
    const { id } = await r.json();
    await page.goto("/app/profile");
    await page.getByLabel("City").fill("After");
    await saved(page);
    const got = await (await page.request.get(`/api/resumes/${id}`)).json();
    expect(got.resume.content.contact.city).toBe("Before");
    expect((await (await page.request.get("/api/profile")).json()).profile.content.contact.city).toBe("After");
  });

  test("F12-E2 a scan or a non-resume file is refused with a reason, and the import is given back", async ({ page, allow, newUser }) => {
    allow(/status of 4(15|22)/);
    await newUser(page);
    await page.goto("/app/profile");
    await page.getByLabel("Resume file (PDF or Word)").setInputFiles(fixture("scan-like.pdf"));
    await expect(page.getByText(/couldn’t find any text in that file/)).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Resume file (PDF or Word)").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("just some text, not a PDF") });
    await expect(page.getByText(/isn’t a PDF or Word/)).toBeVisible();
    const me = await (await page.request.get("/api/me")).json();
    expect(me.usage.import.used).toBe(0);
    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  });

  test("F12-E3 importing over an existing profile asks first", async ({ page, newUser }) => {
    await newUser(page);
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Start with a blank profile" }).click();
    await page.getByLabel("City").fill("Keep me");
    await saved(page);
    await page.getByLabel("Resume file (PDF or Word)").setInputFiles(fixture("sample-resume.pdf"));
    const d = page.getByRole("dialog", { name: "Replace your profile with this file?" });
    await expect(d).toBeVisible({ timeout: 20_000 });
    await d.getByRole("button", { name: "Keep my profile" }).click();
    await expect(page.getByLabel("City")).toHaveValue("Keep me");
    await page.getByLabel("Resume file (PDF or Word)").setInputFiles(fixture("sample-resume.pdf"));
    await page.getByRole("dialog", { name: "Replace your profile with this file?" }).getByRole("button", { name: "Replace it" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Priya Raman");
  });

  test("F12-E4 starting blank is still offered when there's a profile", async ({ page, newUser }) => {
    await newUser(page);
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Start with a blank profile" }).click();
    await page.getByLabel("City").fill("Somewhere");
    await saved(page);
    await page.goto("/app?new=1");
    const dialog = page.getByRole("dialog", { name: "New resume" });
    await dialog.getByRole("radio", { name: /Start blank/ }).click();
    await dialog.getByRole("switch", { name: "I have a job ad" }).click();
    await dialog.getByRole("textbox", { name: /^Resume name/ }).fill("Blank one");
    await dialog.getByRole("combobox", { name: "Experience level" }).click();
    await page.getByRole("option", { name: "Junior" }).click();
    await dialog.getByRole("button", { name: "Create resume" }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByLabel("City")).toHaveValue("");
  });

  test("F12-N1 another user can't see or change this profile", async ({ page, browser, newUser }) => {
    await newUser(page);
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Start with a blank profile" }).click();
    await page.getByLabel("City").fill("Private city");
    await saved(page);
    const b = await secondUser(browser);
    const theirs = await (await b.request.get("/api/profile")).json();
    expect(theirs.profile.content).toBeNull();
    // Their save only ever touches their own profile.
    expect((await b.request.patch("/api/profile", { data: { revision: 0, experienceLevel: "junior" } })).status()).toBe(200);
    const mine = await (await page.request.get("/api/profile")).json();
    expect(mine.profile.content.contact.city).toBe("Private city");
    await b.ctx.close();
  });
});
