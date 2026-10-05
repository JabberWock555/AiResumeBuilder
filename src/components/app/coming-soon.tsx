"use client";

import { Briefcase, Library, Mail, Mic, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/layout";

const ICONS = { Mail, Sparkles, Briefcase, Mic, Library };

/** Placeholder for phase-2 areas. Says plainly what's coming. */
export function ComingSoon({ title, icon, body }: { title: string; icon: keyof typeof ICONS; body: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl text-text">{title}</h1>
      <EmptyState icon={ICONS[icon]} title="Not here yet" body={body} />
    </div>
  );
}
