"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useToast } from "@/components/ui/overlays";
import { api, errorMessage } from "@/lib/api";
import type { Plan, Subscription } from "@/server/repo/types";
import { useUpgrade } from "./upgrade";

export type BillingView = {
  enabled: boolean;
  plan: Plan;
  /** The subscription or purchase that gives the current plan, if any. */
  current: Pick<Subscription, "kind" | "status" | "currentPeriodEnd" | "cancelAtPeriodEnd"> | null;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const KIND: Record<Subscription["kind"], string> = { month: "Pro, monthly", quarter: "Pro, every 3 months", lifetime: "Lifetime" };

/** The Plan card in Settings: upgrade, and cancel in one click. Razorpay emails the receipts. */
export function BillingCard({ billing }: { billing: BillingView }) {
  const router = useRouter();
  const toast = useToast();
  const upgrade = useUpgrade();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { plan, current } = billing;

  async function cancel() {
    setBusy(true);
    try {
      await api("/api/billing/cancel", { method: "POST" });
      setConfirm(false);
      toast({ tone: "success", title: "Plan cancelled. You keep Pro until the end of this period." });
      router.refresh();
    } catch (e) {
      toast({ tone: "error", title: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const ends = current?.currentPeriodEnd ? fmtDate(current.currentPeriodEnd) : null;
  const renewing = current && current.kind !== "lifetime" && !current.cancelAtPeriodEnd;

  return (
    <div className="flex flex-col gap-4 border-b border-border py-5 md:flex-row md:items-start md:justify-between">
      <div className="max-w-md">
        <h3 className="flex items-center gap-2 text-base font-semibold text-text">
          {plan === "free" ? "Free plan" : current ? KIND[current.kind] : "Pro"}
          {plan !== "free" && <Badge tone="pro">Active</Badge>}
          {current?.status === "past_due" && <Badge tone="warning">Payment failed</Badge>}
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          {plan === "free" && "One resume, 10 AI suggestions and 3 PDF downloads."}
          {plan === "lifetime" && "Paid once. Yours for good."}
          {plan === "pro" && current?.status === "past_due" && "The last payment didn’t go through. Razorpay is retrying and has emailed you a link to pay another way."}
          {plan === "pro" && current?.status !== "past_due" && renewing && ends && `Renews on ${ends}.`}
          {plan === "pro" && current?.cancelAtPeriodEnd && ends && `Cancelled. You keep Pro until ${ends}, then move to Free. Your resumes stay. You can subscribe again any time after that.`}
        </p>
        {!billing.enabled && plan === "free" && <p className="mt-1 text-xs text-text-muted">Payments aren’t switched on yet in this build.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-3">
        {plan === "free" && <Button onClick={() => upgrade()}>See Pro</Button>}
        {billing.enabled && renewing && (
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Cancel plan
          </Button>
        )}
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title="Cancel your plan?"
          description={ends ? `You keep Pro until ${ends}. After that you’re on Free and you won’t be charged again.` : "You won’t be charged again."}
          className="max-w-[440px]"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(false)} autoFocus>
                Keep Pro
              </Button>
              <Button variant="danger" loading={busy} onClick={cancel}>
                Cancel plan
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-muted">Your resumes stay. A cancellation can’t be undone, but you can subscribe again once it ends.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
