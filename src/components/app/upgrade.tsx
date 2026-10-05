"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { RadioCard, RadioCardGroup } from "@/components/ui/toggles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The upgrade dialog (S17). Opened when a free limit is hit. Payments are
// connected in /replica-backend; until then it explains instead of charging.

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
  const [plan, setPlan] = useState("quarter");
  const show = useCallback<Open>((r) => {
    setReason(r);
    setOpen(true);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Upgrade to Pro"
          description={reason ? REASONS[reason] ?? "This needs Pro." : "Everything, without limits."}
          footer={
            <>
              <p className="mr-auto text-xs text-text-muted">Payments aren’t switched on yet in this build.</p>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Not now
              </Button>
              <Button disabled>Continue</Button>
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
          <RadioCardGroup value={plan} onValueChange={setPlan} aria-label="Billing period">
            <RadioCard value="month" title="Monthly" description="Cancel any time" aside={<b>Price set at launch</b>} />
            <RadioCard value="quarter" title="Every 3 months" description="Lower monthly price" badge={<Badge tone="new">Best value</Badge>} aside={<b>Price set at launch</b>} />
            <RadioCard value="lifetime" title="Lifetime" description="Pay once" aside={<b>Price set at launch</b>} />
          </RadioCardGroup>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
