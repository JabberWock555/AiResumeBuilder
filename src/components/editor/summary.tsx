"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { Field, Input, Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import type { ExperienceEntry, SkillsEntry } from "@/lib/resume/schema";
import { useEditor } from "./context";

export function SummaryForm() {
  const { content, setContent, resumeId, credits, setCredits, fail } = useEditor();
  const latest = (content.sections.find((s) => s.type === "experience")?.entries as ExperienceEntry[] | undefined)?.[0];
  const allSkills = content.sections.filter((s) => s.type === "skills").flatMap((s) => (s.entries as SkillsEntry[]).flatMap((e) => e.items));
  const [position, setPosition] = useState(latest?.role ?? "");
  const [skills, setSkills] = useState(allSkills.slice(0, 4).join(", "));
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const words = content.summary.text.trim().split(/\s+/).filter(Boolean).length;

  async function generate() {
    setBusy(true);
    try {
      const r = await api<{ text: string; creditsLeft: number | null }>("/api/ai/summary", {
        body: { resumeId, position, skills: skills.split(",").map((s) => s.trim()).filter(Boolean) },
      });
      setCredits(r.creditsLeft);
      setSuggestion(r.text);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl text-text">Summary</h1>
          <p className="mt-1 text-sm text-text-muted">Two or three lines: who you are, what you’re good at, what you want next.</p>
        </div>
        <Field label="Professional summary" helper={`${words} words. Aim for 30 to 80.`}>
          <Textarea
            value={content.summary.text}
            onChange={(e) => setContent((c) => ({ ...c, summary: { text: e.target.value } }))}
            maxLength={1200}
            className="min-h-32"
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4" aria-labelledby="ai-summary-h">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="ai-summary-h" className="text-base font-semibold text-text">
              Draft one with AI
            </h2>
            <p className="mt-1 text-sm text-text-muted">Uses your roles and skills. It leaves [placeholders] for anything only you know.</p>
          </div>
          {credits !== null && <span className="shrink-0 text-xs text-text-muted">{credits} left</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role to lead with">
            <Input value={position} onChange={(e) => setPosition(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Skills to mention" helper="Separate with commas.">
            <Input value={skills} onChange={(e) => setSkills(e.target.value)} maxLength={300} />
          </Field>
        </div>
        <Button variant="ai" className="self-start" loading={busy} disabled={credits === 0} onClick={generate}>
          {!busy && <Sparkles aria-hidden className="size-4" />} {busy ? "Writing…" : "Write a draft"}
        </Button>
        {suggestion && (
          <div className="flex flex-col gap-3 rounded-md bg-ai-soft p-4" aria-live="polite">
            <p className="text-base text-ai">{suggestion}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setContent((c) => ({ ...c, summary: { text: suggestion } }));
                  setSuggestion(null);
                }}
              >
                Use this
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
