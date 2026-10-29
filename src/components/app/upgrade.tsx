"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { RadioCard, RadioCardGroup } from "@/components/ui/toggles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";

// The upgrade dialog (S17). Opened when a free limit is hit, or from Settings.
// Prices come from Razorpay; Continue opens Razorpay Checkout (their modal:
// card, UPI, netbanking), and its success result is verified on our server.
// Without Razorpay keys it explains instead of charging.

type PaidPlan = "month" | "quarter" | "lifetime";
type PlanPrice = { plan: PaidPlan; amount: number; currency: string; period: string | null; interval: number | null };

const UNIT: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
function price(p: PlanPrice | undefined) {
  if (!p) return "Price set at launch";
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency.toUpperCase(), maximumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100);
  if (!p.period) return `${money} once`;
  const unit = UNIT[p.period] ?? p.period;
  return p.interval && p.interval > 1 ? `${money} / ${p.interval} ${unit}s` : `${money} / ${unit}`;
}

type CheckoutStart = {
  keyId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  subscriptionId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
};
type RazorpayResult = { razorpay_payment_id: string; razorpay_signature: string; razorpay_subscription_id?: string; razorpay_order_id?: string };
type RazorpayCtor = new (o: Record<string, unknown>) => { open(): void; on(e: string, cb: (r: { error?: { description?: string } }) => void): void };

let script: Promise<RazorpayCtor> | undefined;
/** Razorpay's checkout script, loaded only when someone pays. */
function loadRazorpay() {
  script ??= new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RazorpayCtor };
    if (w.Razorpay) return resolve(w.Razorpay);
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.async = true;
    el.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("razorpay")));
    el.onerror = () => {
      script = undefined;
      reject(new TypeError("Couldn’t load the payment window"));
    };
    document.body.appendChild(el);
  });
  return script;
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
  const router = useRouter();
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
      const [Razorpay, start] = await Promise.all([loadRazorpay(), api<CheckoutStart>("/api/billing/checkout", { body: { plan } })]);
      // Our dialog traps focus, which would block typing in Razorpay's window: close it first.
      setOpen(false);
      const rzp = new Razorpay({
        key: start.keyId,
        name: start.name,
        description: start.description,
        prefill: start.prefill,
        theme: { color: "#2b2a33" },
        ...(start.subscriptionId ? { subscription_id: start.subscriptionId } : { order_id: start.orderId, amount: start.amount, currency: start.currency }),
        handler: async (r: RazorpayResult) => {
          try {
            await api("/api/billing/verify", { body: r });
            router.push("/app/settings?billing=success");
            router.refresh();
          } catch (e) {
            setError(`Payment received, but we couldn’t confirm it yet: ${errorMessage(e)} It’ll show up within a few minutes.`);
            setOpen(true);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
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
                  {prices?.enabled ? "Secure payment by Razorpay: card, UPI or netbanking. Cancel any time in Settings." : "Payments aren’t switched on yet in this build."}
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
