"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Sparkles, Target, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, Stepper } from "@/components/ui/layout";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/toggles";
import { CheckItem, CheckList, KeywordList, ScoreGauge, ScoreRing } from "@/components/ui/score";
import { ConfirmDialog, Dialog, DialogContent, Tooltip, useToast } from "@/components/ui/overlays";
import { TemplateCard } from "@/components/ui/editor";
import { ScaledPage } from "@/components/resume/scaled-page";
import { ApiError, api } from "@/lib/api";
import { useHash } from "@/lib/use-hash";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/score";
import { FONT_LABELS } from "@/lib/resume/fonts";
import { FONTS, SECTION_LABELS, TEMPLATES, newId, type ExperienceEntry, type ResumeSettings, type TemplateId } from "@/lib/resume/schema";
import { useUpgrade } from "@/components/app/upgrade";
import { cn, focusRing } from "@/lib/cn";
import type { TargetJob } from "@/server/repo/types";
import { useEditor } from "./context";

const TEMPLATE_NAMES: Record<TemplateId, string> = { standard: "Classic", compact: "Compact", modern: "Modern" };
const ACCENTS: { value: ResumeSettings["accent"]; label: string }[] = [
  { value: "ink", label: "Ink" },
  { value: "slate", label: "Slate" },
  { value: "teal", label: "Teal" },
  { value: "plum", label: "Plum" },
];

export function Finish() {
  const { content, settings, templateId, target, report } = useEditor();
  const [pages, setPages] = useState(1);
  const [breaks, setBreaks] = useState(true);
  const hash = useHash();
  const [chosen, setPanel] = useState<string | null>(null);
  const panel = chosen ?? (["score", "keywords", "design"].includes(hash) ? hash : "score");

  const highlight = useMemo(
    () => report.keywords?.filter((k) => k.status === "matched").flatMap((k) => [k.term, ...k.aliases]) ?? [],
    [report.keywords],
  );

  return (
    <div className="mx-auto grid w-full max-w-(--layout-content-max) flex-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-label="Preview" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-muted" aria-live="polite">
            {pages} page{pages > 1 ? "s" : ""}
            {target && highlight.length > 0 && <> · job keywords are highlighted here, not in the download</>}
          </p>
          <Switch label="Show page breaks" checked={breaks} onCheckedChange={setBreaks} />
        </div>
        <div className="rounded-lg bg-surface-muted p-3 md:p-6">
          <ScaledPage
            content={content}
            settings={settings}
            templateId={templateId}
            highlight={highlight}
            pageBreaks={breaks}
            onPages={setPages}
            label={`Preview of your resume, ${pages} page${pages > 1 ? "s" : ""}`}
            className="mx-auto max-w-[816px] shadow-pop"
          />
        </div>
      </section>

      <aside className="flex flex-col gap-4" aria-label="Finish">
        <DownloadCard />
        <Tabs value={panel} onValueChange={setPanel}>
          <TabsList className="w-full" aria-label="Finish options">
            <TabsTrigger value="score" className="flex-1">
              Score
            </TabsTrigger>
            <TabsTrigger value="keywords" className="flex-1">
              Job match
            </TabsTrigger>
            <TabsTrigger value="design" className="flex-1">
              Design
            </TabsTrigger>
          </TabsList>
          <TabsContent value="score" className="pt-4">
            <ScorePanel />
          </TabsContent>
          <TabsContent value="keywords" className="pt-4">
            <KeywordPanel />
          </TabsContent>
          <TabsContent value="design" className="pt-4">
            <DesignPanel pages={pages} />
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ download (S29) */

function DownloadCard() {
  const { resumeId, name, usage, flush, report, fail } = useEditor();
  const upgrade = useUpgrade();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmHoles, setConfirmHoles] = useState(false);
  const max = usage.pdf_download.max;
  const [left, setLeft] = useState<number | null>(max === null ? null : Math.max(0, max - usage.pdf_download.used));
  const holes = report.checks.some((c) => c.id.endsWith(":holes"));

  const download = useCallback(async () => {
    setConfirmHoles(false);
    setBusy(true);
    try {
      let revision = await flush();
      let res = await fetch("/api/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resumeId, format: "pdf", revision }) });
      if (res.status === 409) {
        revision = await flush();
        res = await fetch("/api/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resumeId, format: "pdf", revision }) });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, data.error ?? "error", data);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Resume"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const h = res.headers.get("x-downloads-left");
      if (h && h !== "unchanged" && h !== "unlimited") setLeft(Number(h));
      toast({ tone: "success", title: "PDF downloaded" });
    } catch (e) {
      if (e instanceof ApiError && e.isQuota) upgrade("pdf_download");
      else fail(e);
    } finally {
      setBusy(false);
    }
  }, [flush, resumeId, name, toast, upgrade, fail]);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <ScoreRing score={report.total} size={48} />
        <div className="min-w-0">
          <p className="text-base font-semibold text-text">Ready when you are</p>
          <p className="text-xs text-text-muted">
            {left === null ? "Unlimited downloads" : `${left} free download${left === 1 ? "" : "s"} left`}. Re-downloading an unchanged resume is free.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1" loading={busy} onClick={() => (holes ? setConfirmHoles(true) : download())}>
          {!busy && <Download aria-hidden className="size-4" />} Download PDF
        </Button>
        <Tooltip content="Word downloads aren’t available yet">
          <span tabIndex={0} className={cn("rounded-md", focusRing)}>
            <Button variant="secondary" disabled>
              <FileText aria-hidden className="size-4" /> Word
            </Button>
          </span>
        </Tooltip>
      </div>
      <ConfirmDialog
        open={confirmHoles}
        onOpenChange={setConfirmHoles}
        title="Some [placeholders] aren’t filled in"
        description="Your resume still has bracketed text the AI left for your real numbers. Fix them first, or download anyway."
        confirmLabel="Download anyway"
        onConfirm={download}
      />
    </Card>
  );
}

/* ------------------------------------------------------------ score (S25) */

function ScorePanel() {
  const { report, resumeId } = useEditor();
  const router = useRouter();
  const [cat, setCat] = useState<Category>(() => {
    const worst = [...CATEGORIES].sort((a, b) => report.categories[a] - report.categories[b])[0];
    return worst;
  });
  const checks = report.checks.filter((c) => c.category === cat);
  const order = { error: 0, warning: 1, pass: 2 };
  const go = (c: (typeof checks)[number]) => {
    const tab = c.sectionType ?? (c.id === "contact" ? "contact" : c.id === "summary" ? "summary" : null);
    if (tab) router.push(`/app/resume/${resumeId}/${tab}${c.entryId ? `#${c.entryId}` : ""}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-2">
        <ScoreGauge score={report.total} />
        <p className="text-center text-xs text-text-muted">
          A guide to how complete and clear your resume is. Employers don’t see it, and no hiring system gives resumes a score like this.
        </p>
      </Card>
      <div role="group" aria-label="Score categories" className="grid grid-cols-5 gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-xs",
              cat === c ? "bg-surface text-text shadow-card" : "text-text-muted hover:bg-surface-muted",
              focusRing,
            )}
          >
            <ScoreRing score={report.categories[c]} size={32} label={`${CATEGORY_LABELS[c]} score`} />
            <span className="leading-tight">{CATEGORY_LABELS[c]}</span>
          </button>
        ))}
      </div>
      <Card className="p-4 md:p-4">
        <h3 className="text-sm font-semibold text-text">{CATEGORY_LABELS[cat]}</h3>
        <CheckList>
          {[...checks]
            .sort((a, b) => order[a.severity] - order[b.severity])
            .map((c) => (
              <CheckItem
                key={c.id}
                severity={c.severity}
                title={c.entryLabel ? `${c.title} · ${c.entryLabel}` : c.title}
                target={c.entryLabel ?? (c.sectionType ? SECTION_LABELS[c.sectionType] : c.id === "contact" ? "Contact" : c.id === "summary" ? "Summary" : undefined)}
                onGoTo={c.sectionType || c.id === "contact" || c.id === "summary" ? () => go(c) : undefined}
                defaultOpen={c.severity === "error"}
              >
                {c.detail}
              </CheckItem>
            ))}
        </CheckList>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ keywords (S26) */

function TargetDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: TargetJob | null }) {
  const { resumeId, setTarget, fail } = useEditor();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || description.trim().length < 50) return setError("Add the job title and paste the whole ad.");
    setBusy(true);
    try {
      const r = await api<{ target: TargetJob }>(`/api/resumes/${resumeId}/target`, { method: "PUT", body: { title, company, description } });
      setTarget(r.target);
      onOpenChange(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={initial ? "Edit the job ad" : "Tailor to a job ad"}
        description="We pick out the ad’s keywords and check which ones your resume has."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="target-form" loading={busy}>
              Check keywords
            </Button>
          </>
        }
      >
        <form id="target-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Company">
              <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
            </Field>
          </div>
          <Field label="Job ad" required helper="Paste the whole ad, including the requirements.">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={20000} className="max-h-72 overflow-y-auto" />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KeywordPanel() {
  const { target, report, resumeId, content, setContent, setTarget, credits, setCredits, fail } = useEditor();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ term: string; text: string; entryId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);

  const roles = content.sections
    .filter((s) => (s.type === "experience" || s.type === "projects") && !s.hidden)
    .flatMap((s) => s.entries as ExperienceEntry[])
    .filter((e) => e.role || e.company);

  if (!target || !report.keywords) {
    return (
      <>
        <EmptyState
          icon={Target}
          title="Tailor it to a job"
          body="Paste the job ad and we’ll show which of its keywords your resume is missing."
          action={<Button onClick={() => setEditing(true)}>Add a job ad</Button>}
        />
        {editing && <TargetDialog open={editing} onOpenChange={setEditing} initial={null} />}
      </>
    );
  }

  const next = report.keywords.find((k) => k.status === "missing" && !skipped.includes(k.term));
  const matched = report.keywords.filter((k) => k.status === "matched").length;
  const counted = report.keywords.filter((k) => k.status !== "dismissed").length;

  async function write(term: string, entryId?: string) {
    setBusy(true);
    try {
      const r = await api<{ text: string; entryId: string; creditsLeft: number | null }>("/api/ai/keyword-bullet", { body: { resumeId, term, entryId } });
      setCredits(r.creditsLeft);
      setDraft({ term, text: r.text, entryId: r.entryId });
    } catch (e) {
      if (e instanceof ApiError && e.code === "no_roles") toast({ tone: "info", title: "Add a role in Experience first." });
      else fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(term: string) {
    try {
      const r = await api<{ target: TargetJob }>(`/api/resumes/${resumeId}/target/dismiss`, { body: { term, dismissed: true } });
      setTarget(r.target);
    } catch (e) {
      fail(e);
    }
  }

  function accept() {
    if (!draft) return;
    setContent((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.type === "experience" || s.type === "projects"
          ? {
              ...s,
              entries: (s.entries as ExperienceEntry[]).map((e) =>
                e.id === draft.entryId ? { ...e, bullets: [...e.bullets.filter((b) => b.text.trim()), { id: newId("b"), text: draft.text }] } : e,
              ),
            }
          : s,
      ),
    }));
    toast({ tone: "success", title: `Bullet added to ${roles.find((r) => r.id === draft.entryId)?.role || "that role"}` });
    setDraft(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 p-4 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{target.title}</p>
            {target.company && <p className="truncate text-xs text-text-muted">{target.company}</p>}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit ad
          </Button>
        </div>
        <p className="text-sm text-text">
          Your resume has <b>{matched}</b> of <b>{counted}</b> keywords from this ad.
        </p>
      </Card>

      {next && !draft && (
        <Card className="flex flex-col gap-3 p-4 md:p-4" aria-live="polite">
          <p className="text-sm text-text-muted">The ad mentions this, and your resume doesn’t. Have you done it?</p>
          <Badge tone="ai" className="self-start text-sm">
            {next.term}
          </Badge>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ai" loading={busy} disabled={credits === 0} onClick={() => write(next.term)}>
              {!busy && <Sparkles aria-hidden className="size-4" />} Yes, draft a bullet
            </Button>
            <Button size="sm" variant="secondary" onClick={() => dismiss(next.term)}>
              No, not relevant
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSkipped((s) => [...s, next.term])}>
              Skip for now
            </Button>
          </div>
        </Card>
      )}

      {draft && (
        <Card className="flex flex-col gap-3 p-4 md:p-4">
          <p className="text-sm font-semibold text-text">Draft for “{draft.term}”</p>
          <Field label="Bullet" helper="Fill in the [brackets] with what really happened, or remove them.">
            <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} maxLength={600} />
          </Field>
          <Field label="Add it to">
            <Select
              options={roles.map((r) => ({ value: r.id, label: [r.role, r.company].filter(Boolean).join(" · ") }))}
              value={draft.entryId}
              onValueChange={(v) => setDraft({ ...draft, entryId: v })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={accept}>
              Add to resume
            </Button>
            <Button size="sm" variant="secondary" loading={busy} disabled={credits === 0} onClick={() => write(draft.term, draft.entryId)}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {!next && !draft && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">Every keyword from the ad is covered or marked not relevant.</p>
      )}

      <Card className="p-4 md:p-4">
        <KeywordList keywords={report.keywords.map((k) => ({ term: k.term, status: k.status }))} />
      </Card>
      {editing && <TargetDialog open={editing} onOpenChange={setEditing} initial={target} />}
    </div>
  );
}

/* ------------------------------------------------------------ design (S27, S28) */

function DesignPanel({ pages }: { pages: number }) {
  const { content, settings, setSettings, templateId, setTemplate } = useEditor();
  const [fitting, setFitting] = useState(false);
  const set = (p: Partial<ResumeSettings>) => setSettings((s) => ({ ...s, ...p }));

  // Auto-fit: shrink spacing, then font size, until it fits on one page.
  useEffect(() => {
    if (!fitting) return;
    const t = setTimeout(() => {
      if (pages <= 1) return setFitting(false);
      if (settings.sectionSpacing > 1) return set({ sectionSpacing: settings.sectionSpacing - 1 });
      if (settings.fontSize > 9) return set({ fontSize: Math.round((settings.fontSize - 0.5) * 10) / 10 });
      setFitting(false);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitting, pages, settings.sectionSpacing, settings.fontSize]);

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="tpl-h">
        <h3 id="tpl-h" className="mb-2 text-sm font-semibold text-text">
          Template
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t} name={TEMPLATE_NAMES[t]} selected={templateId === t} onSelect={() => setTemplate(t)}>
              <ScaledPage content={content} settings={settings} templateId={t} clip />
            </TemplateCard>
          ))}
        </div>
      </section>
      <Card className="flex flex-col gap-4 p-4 md:p-4">
        <Field label="Font">
          <Select options={FONTS.map((f) => ({ value: f, label: FONT_LABELS[f] }))} value={settings.font} onValueChange={(v) => set({ font: v as ResumeSettings["font"] })} />
        </Field>
        <Stepper label="Font size" value={settings.fontSize} onChange={(v) => set({ fontSize: v })} min={8} max={12} step={0.5} unit="pt" />
        <Stepper label="Space between sections" value={settings.sectionSpacing} onChange={(v) => set({ sectionSpacing: v })} min={0} max={6} />
        <Switch label="Lines under headings" checked={settings.divider} onCheckedChange={(v) => set({ divider: v })} className="justify-between" />
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text" id="accent-l">
            Heading colour
          </span>
          <div role="radiogroup" aria-labelledby="accent-l" className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={settings.accent === a.value}
                aria-label={a.label}
                onClick={() => set({ accent: a.value })}
                className={cn(
                  "size-8 rounded-pill border-2",
                  settings.accent === a.value ? "border-focus" : "border-transparent",
                  focusRing,
                )}
                style={{ background: `var(--c-resume-${a.value})` }}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text" id="paper-l">
            Paper size
          </span>
          <SegmentedControl
            aria-labelledby="paper-l"
            value={settings.pageSize}
            onValueChange={(v) => set({ pageSize: v as ResumeSettings["pageSize"] })}
            options={[
              { value: "letter", label: "Letter" },
              { value: "a4", label: "A4" },
            ]}
          />
        </div>
        <Button variant="secondary" loading={fitting} disabled={pages <= 1} onClick={() => setFitting(true)}>
          {!fitting && <Wand2 aria-hidden className="size-4" />} {pages <= 1 ? "Fits on one page" : "Fit to one page"}
        </Button>
      </Card>
    </div>
  );
}
