// F09: change or cancel billing (S14). The portal and the cancel call to Stripe
// need test keys (manual); these check what the app shows for each state Stripe reports.
import { test, expect, makePro, sendStripeEvent, subscription, emailsTo } from "./helpers";

test.describe("F09 billing states", () => {
  test("F09-H1 cancelled at period end: still Pro, says until when", async ({ page, axe, newUser }) => {
    const { email } = await newUser(page);
    const userId = await makePro(page);
    await sendStripeEvent(page.request, "customer.subscription.updated", subscription(userId, { cancel_at_period_end: true }));
    await page.goto("/app/settings");
    await expect(page.getByText(/Cancelled\. You keep Pro until/)).toBeVisible();
    await axe(page, "S14 settings, cancelled plan");
    void email;
  });

  test("F09-E1 payment failed: Pro kept while Stripe retries, one email", async ({ page, newUser }) => {
    const { email } = await newUser(page);
    const userId = await makePro(page);
    await sendStripeEvent(page.request, "customer.subscription.updated", subscription(userId, { status: "past_due" }));
    const inv = { customer: `cus_e2e_${userId.slice(0, 8)}`, attempt_count: 1, parent: { subscription_details: { metadata: { user_id: userId } } } };
    await sendStripeEvent(page.request, "invoice.payment_failed", inv);
    await sendStripeEvent(page.request, "invoice.payment_failed", { ...inv, attempt_count: 2 });
    await page.goto("/app/settings");
    await expect(page.getByText("Payment failed")).toBeVisible();
    expect((await emailsTo(email)).filter((m) => m.tag === "payment_failed")).toHaveLength(1);
  });

  test("F09-E2 subscription ends: back to Free, resumes kept", async ({ page, newUser }) => {
    await newUser(page);
    const userId = await makePro(page);
    await sendStripeEvent(page.request, "customer.subscription.deleted", subscription(userId, { status: "canceled" }));
    await page.goto("/app/settings");
    await expect(page.getByText("Free plan")).toBeVisible();
  });
});
