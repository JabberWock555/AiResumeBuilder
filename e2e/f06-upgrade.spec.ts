// F06: upgrade (S17 dialog → Razorpay Checkout). Paying needs Razorpay test keys (manual, see test-plan.md).
import { test, expect, createResume, baseURL, makePro } from "./helpers";

test.describe("F06 upgrade", () => {
  test("F06-H1 hitting the resume limit opens the upgrade dialog, which is honest about payments", async ({ page, axe, newUser }) => {
    await newUser(page);
    await createResume(page.request, baseURL(page));
    await page.goto("/app");
    await page.getByRole("button", { name: "New resume" }).first().click();
    const d = page.getByRole("dialog", { name: "Upgrade to Pro" });
    await expect(d.getByText("The free plan includes one resume.")).toBeVisible();
    await axe(page, "S17 upgrade");
    // Without Razorpay keys there's no way to pay, and the dialog says so.
    await expect(d.getByText(/Payments aren’t switched on/)).toBeVisible();
    await expect(d.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("F06-N1 checkout without billing set up is refused cleanly, never half-done", async ({ page, allow, newUser }) => {
    allow(/status of 503/);
    await newUser(page);
    const r = await page.request.post("/api/billing/checkout", { data: { plan: "month" } });
    expect(r.status()).toBe(503);
    expect((await r.json()).error).toBe("billing_off");
  });

  test("F06-H2 after Razorpay confirms, limits lift: more resumes, Pro in Settings", async ({ page, newUser }) => {
    await newUser(page);
    await createResume(page.request, baseURL(page));
    await makePro(page);
    await createResume(page.request, baseURL(page), { name: "Second resume" });
    await page.goto("/app/settings");
    await expect(page.getByText("Pro, monthly")).toBeVisible();
    await expect(page.getByText(/Renews on/)).toBeVisible();
  });

  test("F06-N2 a forged or unsigned webhook can't grant Pro", async ({ page, allow, newUser }) => {
    allow(/status of 400/);
    await newUser(page);
    const me = await (await page.request.get("/api/me")).json();
    const body = JSON.stringify({ event: "subscription.activated", payload: { subscription: { entity: { id: "sub_forged", plan_id: "p", status: "active", notes: { user_id: me.user.id } } } } });
    const headers = { "content-type": "application/json", "x-razorpay-event-id": "evt_forged" };
    const r1 = await page.request.post("/api/webhooks/razorpay", { data: body, headers });
    const r2 = await page.request.post("/api/webhooks/razorpay", { data: body, headers: { ...headers, "x-razorpay-signature": "deadbeef".repeat(8) } });
    expect([r1.status(), r2.status()]).toEqual([400, 400]);
    expect((await (await page.request.get("/api/me")).json()).user.plan).toBe("free");
  });
});
