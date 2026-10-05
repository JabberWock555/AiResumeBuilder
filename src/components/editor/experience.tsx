"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { Field, Input } from "@/components/ui/field";
import { AiButton, BulletEditor, EntryCard, MonthYearPicker } from "@/components/ui/editor";
import { CheckItem, CheckList } from "@/components/ui/score";
import { api } from "@/lib/api";
import { formatRange, newId, type ExperienceEntry } from "@/lib/resume/schema";
import { useEditor } from "./context";
import { useSection } from "./use-section";
import { useHash } from "@/lib/use-hash";

type Kind = "experience" | "projects" | "involvement";

const COPY: Record<Kind, { title: string; intro: string; role: string; org: string; add: string; untitled: string; empty: string }> = {
  experience: {
    title: "Experience",
    intro: "Jobs, internships and freelance work, newest first. Lead each bullet with what you did and what changed.",
    role: "Job title",
    org: "Company",
    add: "Add a role",
    untitled: "New role",
    empty: "No roles yet. Add your most recent one first.",
  },
  projects: {
    title: "Projects",
    intro: "Things you built or led outside a job, or a project worth its own spotlight.",
    role: "Project name",
    org: "Where or for whom",
    add: "Add a project",
    untitled: "New project",
    empty: "No projects yet.",
  },
  involvement: {
    title: "Involvement",
    intro: "Volunteering, societies, leadership roles.",
    role: "Your role",
    org: "Organisation",
    add: "Add involvement",
    untitled: "New role",
    empty: "Nothing here yet.",
  },
};

export function ExperienceForm({ type }: { type: Kind }) {
  const { entries, update, add, remove, duplicate, move } = useSection(type);
  const copy = COPY[type];
  // An entry named in the URL hash (a link from the score report) opens and scrolls into view.
  const hash = useHash();
  const [added, setOpened] = useState<string | null>(null);
  const opened = added ?? (hash || null);

  useEffect(() => {
    if (hash) requestAnimationFrame(() => document.getElementById(`entry-${hash}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [hash]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl text-text">{copy.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{copy.intro}</p>
      </div>
      {entries.length === 0 && <Card className="text-sm text-text-muted">{copy.empty}</Card>}
      {(entries as ExperienceEntry[]).map((e, i) => (
        <div id={`entry-${e.id}`} key={e.id} className="scroll-mt-32">
          <EntryCard
            title={e.role || copy.untitled}
            subtitle={[e.company, formatRange(e.start, e.end)].filter(Boolean).join(" · ")}
            index={i}
            count={entries.length}
            onMove={move}
            onDuplicate={() => duplicate(e.id)}
            onDelete={() => remove(e.id)}
            defaultOpen={opened === e.id || entries.length === 1 || (!e.role && !e.company)}
            key={opened === e.id ? `${e.id}-open` : e.id}
          >
            <EntryFields entry={e} kind={type} onChange={(p) => update(e.id, p as never)} />
          </EntryCard>
        </div>
      ))}
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => {
          const id = add();
          setOpened(id);
        }}
      >
        <Plus aria-hidden className="size-4" /> {copy.add}
      </Button>
    </div>
  );
}

function EntryFields({ entry: e, kind, onChange }: { entry: ExperienceEntry; kind: Kind; onChange: (p: Partial<ExperienceEntry>) => void }) {
  const { resumeId, report, credits, setCredits, fail } = useEditor();
  const copy = COPY[kind];
  const [active, setActive] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ bulletId: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const org = e.company.trim();
  const ready = !!(e.role.trim() || org);
  const checks = report.checks.filter((c) => c.entryId === e.id && c.severity !== "pass");
  const issues = report.bulletIssues.filter((x) => e.bullets.some((b) => b.id === x.bulletId));
  const dateError =
    e.start && e.end && e.end !== "present" && (e.end.year < e.start.year || (e.end.year === e.start.year && e.end.month < e.start.month))
      ? "The end date is before the start date."
      : undefined;

  async function run(mode: "suggest" | "complete" | "quantify" | "rewrite") {
    let bullets = e.bullets;
    let targetBullet = bullets.find((b) => b.id === active) ?? [...bullets].reverse().find((b) => b.text.trim()) ?? bullets[0];
    if (mode === "suggest" || !targetBullet) {
      const empty = bullets.find((b) => !b.text.trim());
      if (empty) targetBullet = empty;
      else {
        targetBullet = { id: newId("b"), text: "" };
        bullets = [...bullets, targetBullet];
        onChange({ bullets });
      }
    }
    const effective = targetBullet.text.trim() ? mode : "suggest";
    setBusy(true);
    try {
      const r = await api<{ text: string; creditsLeft: number | null }>("/api/ai/bullet", {
        body: { resumeId, entryId: e.id, bulletId: targetBullet.id, text: targetBullet.text, mode: effective },
      });
      setCredits(r.creditsLeft);
      setSuggestion({ bulletId: targetBullet.id, text: r.text });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={copy.role}>
          <Input value={e.role} onChange={(x) => onChange({ role: x.target.value })} maxLength={120} />
        </Field>
        <Field label={copy.org}>
          <Input value={e.company} onChange={(x) => onChange({ company: x.target.value })} maxLength={120} />
        </Field>
        <Field label="Started">
          <MonthYearPicker label="Start month" value={e.start} onChange={(v) => onChange({ start: v === "present" ? null : v })} />
        </Field>
        <Field label="Finished" error={dateError}>
          <MonthYearPicker label="End month" value={e.end} onChange={(v) => onChange({ end: v })} allowPresent min={e.start} invalid={!!dateError} />
        </Field>
        <Field label={org ? `Where is ${org} based?` : "Location"} className="sm:col-span-2" helper="City and state, or “Remote”.">
          <Input value={e.location} onChange={(x) => onChange({ location: x.target.value })} maxLength={120} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-text" id={`${e.id}-bullets`}>
            {org ? `What did you do at ${org}?` : "What did you do?"}
          </span>
          <AiButton
            credits={credits}
            state={busy ? "generating" : ready && credits !== 0 ? "ready" : "not-ready"}
            notReadyReason={!ready ? `Add the ${copy.role.toLowerCase()} or ${copy.org.toLowerCase()} first` : "No AI suggestions left on your plan"}
            onRun={() => run("complete")}
            modes={[
              { label: "Write a new bullet", onSelect: () => run("suggest") },
              { label: "Add a number to it", onSelect: () => run("quantify") },
              { label: "Rewrite it", onSelect: () => run("rewrite") },
            ]}
          />
        </div>
        <p className="text-xs text-text-muted">
          3 to 6 bullets. Real numbers beat adjectives. AI suggestions leave a [placeholder] wherever only you know the fact.
        </p>
        <div role="group" aria-labelledby={`${e.id}-bullets`}>
          <BulletEditor
            bullets={e.bullets}
            onChange={(bullets) => onChange({ bullets })}
            issues={issues}
            newId={() => newId("b")}
            onFocusBullet={setActive}
            suggestion={suggestion}
            onApplySuggestion={() => {
              if (!suggestion) return;
              onChange({ bullets: e.bullets.map((b) => (b.id === suggestion.bulletId ? { ...b, text: suggestion.text } : b)) });
              setSuggestion(null);
            }}
            onDismissSuggestion={() => setSuggestion(null)}
          />
        </div>
      </div>

      {checks.length > 0 && (
        <details className="rounded-md bg-surface-muted px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-text">
            {checks.length} thing{checks.length > 1 ? "s" : ""} to improve here
          </summary>
          <CheckList className="mt-1">
            {checks.map((c) => (
              <CheckItem key={c.id} severity={c.severity} title={c.title}>
                {c.detail}
              </CheckItem>
            ))}
          </CheckList>
        </details>
      )}
    </div>
  );
}
