// F09: change or cancel billing (S14). Cancelling calls Razorpay's API and
// needs test keys (manual, see test-plan.md); these check what the app shows
// for each state Razorpay reports through its webhook.
import { test, expect, makePro, sendRazorpayEvent, subscription, emailsTo } from "./helpers";

test.describe("F09 billing states", () => {
  test("F09-H1 active subscription: Pro, with the renewal date", async ({ page, axe, newUser }) => {
    await newUser(page);
    await makePro(page);
    await page.goto("/app/settings");
    await expect(page.getByText("Pro, monthly")).toBeVisible();
    await expect(page.getByText(/Renews on/)).toBeVisible();
    await axe(page, "S14 settings, Pro plan");
  });

  test("F09-E1 renewal failed: Pro kept while Razorpay retries, one email", async ({ page, newUser }) => {
    const { email } = await newUser(page);
    const userId = await makePro(page);
    await sendRazorpayEvent(page.request, "subscription.pending", subscription(userId, { status: "pending" }));
    await sendRazorpayEvent(page.request, "subscription.pending", subscription(userId, { status: "pending" }));
    await page.goto("/app/settings");
    await expect(page.getByText("Payment failed")).toBeVisible();
    await expect(page.getByText(/Razorpay is retrying/)).toBeVisible();
    expect((await emailsTo(email)).filter((m) => m.tag === "payment_failed")).toHaveLength(1);
  });

  test("F09-E2 retries run out (halted), or it's cancelled: back to Free, resumes kept", async ({ page, newUser }) => {
    await newUser(page);
    const userId = await makePro(page);
    await sendRazorpayEvent(page.request, "subscription.halted", subscription(userId, { status: "halted" }));
    await page.goto("/app/settings");
    await expect(page.getByText("Free plan")).toBeVisible();
    await sendRazorpayEvent(page.request, "subscription.activated", subscription(userId));
    await sendRazorpayEvent(page.request, "subscription.cancelled", subscription(userId, { status: "cancelled" }));
    await page.reload();
    await expect(page.getByText("Free plan")).toBeVisible();
  });

  test("F09-E3 lifetime purchase, then a full refund", async ({ page, newUser }) => {
    await newUser(page);
    const me = await (await page.request.get("/api/me")).json();
    const order = { id: `order_e2e${Date.now()}`, entity: "order", status: "paid", amount: 499900, currency: "INR", notes: { user_id: me.user.id, plan: "lifetime" } };
    const payment = { id: `pay_e2e${Date.now()}`, entity: "payment", order_id: order.id, amount: 499900, currency: "INR", status: "captured" };
    await sendRazorpayEvent(page.request, "order.paid", { order: { entity: order }, payment: { entity: payment } });
    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: /Lifetime/ })).toBeVisible();
    await sendRazorpayEvent(page.request, "refund.processed", { payment: { entity: { ...payment, amount_refunded: 499900 } } });
    await page.reload();
    await expect(page.getByText("Free plan")).toBeVisible();
  });
});
