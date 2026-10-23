"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { RadioCard, RadioCardGroup } from "@/components/ui/toggles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";

// The upgrade dialog (S17). Opened when a free limit is hit, or from Settings.
// Prices come from Stripe; Continue goes to Stripe Checkout. Without Stripe
// keys it explains instead of charging.

type PaidPlan = "month" | "quarter" | "lifetime";
type PlanPrice = { plan: PaidPlan; amount: number; currency: string; interval: string | null; intervalCount: number | null };

function price(p: PlanPrice | undefined) {
  if (!p) return "Price set at launch";
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency.toUpperCase() }).format(p.amount / 100);
  if (!p.interval) return `${money} once`;
  const every = p.intervalCount && p.intervalCount > 1 ? `${p.intervalCount} ${p.interval}s` : p.interval;
  return `${money} / ${every}`;
}

const REASONS: Record<string, string> = {
  resume: "The free plan includes one resume.",
  ai_generation: "You've used your free AI suggestions.",
  pdf_download: "You've used your free downloads.",
  docx_download: "Word downloads are part of Pro.",
  import: "You've used your free imports.",
};

type Open = (reason?: string) => void;
const Ctx = createContext<Open>(() => {});
export const useUpgrade = () => useContext(Ctx);

export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>();
  const [plan, setPlan] = useState<PaidPlan>("quarter");
  const [prices, setPrices] = useState<{ enabled: boolean; plans: PlanPrice[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const show = useCallback<Open>((r) => {
    setReason(r);
    setError(undefined);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open || prices) return;
    api<{ enabled: boolean; plans: PlanPrice[] }>("/api/billing/plans")
      .then(setPrices)
      .catch(() => setPrices({ enabled: false, plans: [] }));
  }, [open, prices]);

  async function checkout() {
    setBusy(true);
    setError(undefined);
    try {
      const { url } = await api<{ url: string }>("/api/billing/checkout", { body: { plan } });
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const of = (p: PaidPlan) => prices?.plans.find((x) => x.plan === p);
  return (
    <Ctx.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Upgrade to Pro"
          description={reason ? REASONS[reason] ?? "This needs Pro." : "Everything, without limits."}
          footer={
            <>
              {error ? (
                <p role="alert" className="mr-auto text-sm text-danger">
                  {error}
                </p>
              ) : (
                <p className="mr-auto text-xs text-text-muted">
                  {prices?.enabled ? "Secure checkout by Stripe. Cancel any time in Settings." : "Payments aren’t switched on yet in this build."}
                </p>
              )}
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Not now
              </Button>
              <Button disabled={!prices?.enabled || !of(plan)} loading={busy} onClick={checkout}>
                Continue
              </Button>
            </>
          }
        >
          <ul className="mb-5 grid gap-2 text-sm text-text sm:grid-cols-2">
            {["Unlimited resumes", "300 AI suggestions a month", "Unlimited PDF and Word downloads", "Every template", "Every check and keyword"].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <Check aria-hidden className="size-4 text-success" /> {x}
              </li>
            ))}
          </ul>
          <RadioCardGroup value={plan} onValueChange={(v) => setPlan(v as PaidPlan)} aria-label="Billing period">
            <RadioCard value="month" title="Monthly" description="Cancel any time" aside={<b>{price(of("month"))}</b>} />
            <RadioCard value="quarter" title="Every 3 months" description="Lower monthly price" badge={<Badge tone="new">Best value</Badge>} aside={<b>{price(of("quarter"))}</b>} />
            <RadioCard value="lifetime" title="Lifetime" description="Pay once" aside={<b>{price(of("lifetime"))}</b>} />
          </RadioCardGroup>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
