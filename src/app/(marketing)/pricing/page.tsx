import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Pricing" };

// Structure only. Prices are decided in /replica-launch.
const PLANS = [
  { name: "Free", price: "Free", body: "Everything you need for one resume.", items: ["1 resume", "10 AI suggestions", "3 PDF downloads", "Every check and template"], cta: "Start free" },
  { name: "Pro", price: "Set at launch", body: "For an active job search.", items: ["Unlimited resumes", "300 AI suggestions a month", "Unlimited PDF and Word downloads", "Cancel in one click"], cta: "Start free, upgrade later" },
];

export default function Pricing() {
  return (
    <div className="mx-auto flex max-w-(--layout-content-max) flex-col gap-8 px-4 py-12 md:px-6">
      <div>
        <h1 className="text-2xl text-text">Pricing</h1>
        <p className="mt-2 text-base text-text-muted">Start free. Upgrade only if you need more.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {PLANS.map((p) => (
          <Card key={p.name} className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg text-text">{p.name}</h2>
              <p className="text-xl text-text">{p.price}</p>
              <p className="text-sm text-text-muted">{p.body}</p>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-text">
              {p.items.map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <Check aria-hidden className="size-4 text-success" /> {i}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-auto">
              <Link href="/signup">{p.cta}</Link>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
