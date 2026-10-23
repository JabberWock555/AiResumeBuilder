// F11 (clone): account and security. Sign in, emailed links, change email,
// reset password, sign out everywhere, delete account, rate limits.
import { test, expect, emailLink, emailsTo, createResume, baseURL, BASE } from "./helpers";

test.describe("F11 account", () => {
  test("F11-H1 log out and back in from the account menu", async ({ page, axe, newUser }) => {
    const { email, password } = await newUser(page);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/(login)?$/);
    await page.goto("/login");
    await axe(page, "S06 log in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("F11-N1 wrong password and unknown email get the same message", async ({ page, allow, newUser }) => {
    allow(/status of 401/);
    const { email } = await newUser(page);
    await page.context().clearCookies();
    for (const e of [email, "nobody-here@example.com"]) {
      await page.goto("/login");
      await page.getByLabel("Email").fill(e);
      await page.getByLabel("Password").fill("not-the-password");
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page.getByText("That email and password don’t match an account.")).toBeVisible();
    }
  });

  test("F11-N2 logging in before confirming the email is refused, with a resend", async ({ page, allow }) => {
    allow(/status of 403/);
    const email = `e2e-unverified-${Date.now()}@example.com`;
    await page.request.post("/api/auth/signup", { data: { fullName: "Not Yet", email, password: "unverified-pass-1" } });
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("unverified-pass-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await page.getByRole("button", { name: "Send it again" }).click();
    await expect(page.getByRole("button", { name: "Sent again" })).toBeVisible();
    expect((await emailsTo(email)).filter((m) => m.tag === "verify").length).toBe(2);
  });

  test("F11-N3 signing up with a taken email looks the same and tells the owner instead", async ({ page, newUser }) => {
    const { email } = await newUser(page);
    const r = await page.request.post("/api/auth/signup", { data: { fullName: "Imposter", email, password: "another-password-1" } });
    expect(r.status()).toBe(202);
    expect((await emailsTo(email)).some((m) => m.tag === "account_exists")).toBe(true);
  });

  test("F11-N4 an emailed link works once", async ({ page, newUser }) => {
    const { email } = await newUser(page);
    await page.goto(await emailLink(email, "verify"));
    await expect(page).toHaveURL(/\/login\?error=link/);
    await expect(page.getByText(/expired or was already used/)).toBeVisible();
  });

  test("F11-H2 reset password by email: signs in here, signs out other devices, old password stops working", async ({ page, browser, allow, newUser }) => {
    allow(/status of 401/);
    const { email, password } = await newUser(page);
    const ctx = await browser.newContext({ baseURL: BASE });
    const other = await ctx.newPage();
    await other.goto("/forgot-password");
    await other.getByLabel("Email").fill(email);
    await other.getByRole("button", { name: "Send reset link" }).click();
    await expect(other.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await other.goto(await emailLink(email, "reset"));
    await expect(other).toHaveURL(/\/reset-password$/);
    await other.getByLabel("New password").fill("a-brand-new-password-9");
    await other.getByRole("button", { name: "Save password" }).click();
    await expect(other).toHaveURL(/\/app/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(401);
    expect((await page.request.post("/api/auth/login", { data: { email, password: "a-brand-new-password-9" } })).status()).toBe(200);
    await ctx.close();
  });

  test("F11-E1 /reset-password without a valid link says it expired", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  test("F11-H3 change email: confirmed by link, then the new address logs in", async ({ page, axe, allow, newUser }) => {
    allow(/status of 401/);
    const { password } = await newUser(page);
    const newEmail = `e2e-new-${Date.now()}@example.com`;
    await page.goto("/app/settings");
    await axe(page, "S14 settings");
    await page.getByRole("button", { name: "Change email" }).click();
    await page.getByLabel("New email").fill(newEmail);
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.getByText(/Your address changes to/).first()).toBeVisible();
    await page.goto(await emailLink(newEmail, "change_email"));
    await expect(page.getByText(newEmail).first()).toBeVisible();
    await page.context().clearCookies();
    expect((await page.request.post("/api/auth/login", { data: { email: newEmail, password } })).status()).toBe(200);
  });

  test("F11-N5 changing to an email another account uses is refused", async ({ page, browser, allow, newUser }) => {
    allow(/status of 409/);
    const { email: taken } = await newUser(page);
    const ctx = await browser.newContext({ baseURL: BASE });
    const p2 = await ctx.newPage();
    const second = `e2e-second-${Date.now()}@example.com`;
    await ctx.request.post("/api/auth/signup", { data: { fullName: "Two", email: second, password: "second-pass-123" } });
    await p2.goto(await emailLink(second, "verify"));
    expect((await ctx.request.post("/api/me/email", { data: { email: taken } })).status()).toBe(409);
    await ctx.close();
  });

  test("F11-H4 sign out everywhere ends every session", async ({ page, browser, newUser }) => {
    const { email, password } = await newUser(page);
    const ctx = await browser.newContext({ baseURL: BASE });
    expect((await ctx.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(200);
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect((await ctx.request.get("/api/me")).status()).toBe(401);
    await ctx.close();
  });

  test("F11-H5 delete account removes everything and the login stops working", async ({ page, allow, newUser }) => {
    allow(/status of 401/);
    const { email, password } = await newUser(page);
    const id = await createResume(page.request, baseURL(page));
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Delete account" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByRole("button", { name: "Delete everything" })).toBeDisabled();
    await d.getByLabel(`Type ${email} to confirm`).fill(email);
    await d.getByRole("button", { name: "Delete everything" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(401);
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(".data/db.json", "utf8")).not.toContain(id);
  });

  test("F11-N6 signed out: the app redirects to log in and comes back after", async ({ page, newUser }) => {
    const { email, password } = await newUser(page);
    await page.context().clearCookies();
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fsettings/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
  });

  test("F11-N7 log in ignores a 'next' that points to another site", async ({ page, newUser }) => {
    const { email, password } = await newUser(page);
    await page.context().clearCookies();
    await page.goto("/login?next=https://evil.example.com/app");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(`${BASE}/app`);
  });

  test("F11-N8 repeated wrong passwords are rate limited", async ({ page, allow }) => {
    allow(/status of 40[19]|status of 429/);
    await page.goto("/login");
    const email = `nobody-${Date.now()}@example.com`;
    const s: number[] = [];
    for (let i = 0; i < 11; i++) s.push((await page.request.post("/api/auth/login", { data: { email, password: "wrong" } })).status());
    expect(s.slice(0, 10).every((x) => x === 401)).toBe(true);
    expect(s[10]).toBe(429);
  });

  test("F11-N9 state-changing requests from another site are refused", async ({ page, allow, newUser }) => {
    allow(/status of 401/);
    await newUser(page);
    const r = await page.request.post("/api/resumes", { data: { name: "csrf", experienceLevel: "junior" }, headers: { origin: "https://evil.example.com" } });
    expect(r.status()).toBe(401);
  });
});
