"use client";

import { ScaledPage } from "@/components/resume/scaled-page";
import { SAMPLE, SAMPLE_SETTINGS } from "@/lib/resume/sample";
import { TEMPLATES, type TemplateId } from "@/lib/resume/schema";

const NAMES: Record<TemplateId, [string, string]> = {
  standard: ["Classic", "Centred name, ruled headings. Safe for any industry."],
  compact: ["Compact", "Tighter spacing to fit more on one page."],
  modern: ["Modern", "Left-aligned with a colour accent on headings."],
};

export function TemplateGallery({ limit }: { limit?: number }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {TEMPLATES.slice(0, limit).map((t) => (
        <li key={t} className="flex flex-col gap-3">
          <div className="rounded-lg bg-surface-muted p-4">
            <ScaledPage content={SAMPLE} settings={{ ...SAMPLE_SETTINGS, accent: t === "modern" ? "teal" : "ink" }} templateId={t} clip className="shadow-pop" label={`${NAMES[t][0]} template example`} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text">{NAMES[t][0]}</h3>
            <p className="text-sm text-text-muted">{NAMES[t][1]}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
