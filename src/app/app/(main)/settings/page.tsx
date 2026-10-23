import { Suspense } from "react";
import type { Metadata } from "next";
import { billingStore, repo } from "@/server/repo";
import { config } from "@/server/config";
import { requireUserPage } from "@/server/session";
import { SettingsForms } from "@/components/app/settings";
import type { BillingView } from "@/components/app/billing";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUserPage();
  const [usage, account] = await Promise.all([repo.usage(user.id), billingStore.account(user.id)]);
  // What gives the current plan: an active lifetime purchase, else the newest live subscription.
  const live = account.subscriptions.filter((s) => ["active", "trialing", "past_due"].includes(s.status));
  const current = live.find((s) => s.kind === "lifetime") ?? live[0] ?? null;
  const billing: BillingView = {
    enabled: config.billing,
    plan: account.plan,
    current: current && {
      kind: current.kind, status: current.status, currentPeriodEnd: current.currentPeriodEnd, cancelAtPeriodEnd: current.cancelAtPeriodEnd,
    },
    hasCustomer: Boolean(account.stripeCustomerId),
  };
  return (
    <Suspense>
      <SettingsForms user={user} usage={usage} billing={billing} />
    </Suspense>
  );
}
