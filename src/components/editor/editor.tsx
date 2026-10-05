"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, CloudOff, Eye, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/ui/layout";
import { SectionNav } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { CheckItem, CheckList, ScoreRing, band } from "@/components/ui/score";
import {
  Dialog,
  DialogContent,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuLabel,
  MenuTrigger,
  useToast,
} from "@/components/ui/overlays";
import { ScaledPage } from "@/components/resume/scaled-page";
import { RAIL } from "@/components/app/nav-items";
import { useUpgrade } from "@/components/app/upgrade";
import { ApiError, errorMessage } from "@/lib/api";
import { scoreResume, type Check as ScoreCheck } from "@/lib/score";
import {
  SECTION_LABELS,
  blankSection,
  type ResumeContent,
  type ResumeSettings,
  type SectionType,
  type TemplateId,
} from "@/lib/resume/schema";
import { cn, focusRing } from "@/lib/cn";
import type { Resume, TargetJob, Usage } from "@/server/repo/types";
import { useAutosave, type SaveStatus } from "./autosave";
import { EditorContext, type EditorCtx } from "./context";
import { ContactForm } from "./contact";
import { ExperienceForm } from "./experience";
import { EducationForm, SimpleForm, SkillsForm } from "./other-sections";
import { SummaryForm } from "./summary";
import { Finish } from "./finish";

export const OPTIONAL: SectionType[] = ["projects", "certifications", "coursework", "involvement"];
const FIXED_TABS = ["contact", "experience", "education", "skills", "summary"] as const;

export function tabsFor(content: ResumeContent) {
  const optional = OPTIONAL.filter((t) => content.sections.some((s) => s.type === t && !s.hidden));
  return [...FIXED_TABS, ...optional, "finish"] as string[];
}

const TAB_LABEL: Record<string, string> = {
  contact: "Contact",
  summary: "Summary",
  finish: "Finish and download",
  ...SECTION_LABELS,
};

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const map = {
    saved: { icon: <Check aria-hidden className="size-4 text-success" />, text: "Saved" },
    unsaved: { icon: <Loader2 aria-hidden className="size-4 text-text-muted" />, text: "Unsaved changes" },
    saving: { icon: <Loader2 aria-hidden className="size-4 animate-spin text-text-muted" />, text: "Saving…" },
    offline: { icon: <CloudOff aria-hidden className="size-4 text-warning" />, text: "Not saved" },
    conflict: { icon: <CloudOff aria-hidden className="size-4 text-danger" />, text: "Changed elsewhere" },
  }[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-muted" role="status" aria-live="polite">
      {map.icon}
      <span className="hidden sm:inline">{map.text}</span>
      {status === "offline" && (
        <button type="button" onClick={onRetry} className={cn("font-medium text-text underline underline-offset-2", focusRing)}>
          Retry
        </button>
      )}
    </span>
  );
}

export function Editor({
  resume,
  initialTarget,
  usage,
  others,
}: {
  resume: Resume;
  initialTarget: TargetJob | null;
  usage: Usage;
  others: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const upgrade = useUpgrade();
  const params = useParams<{ tab?: string }>();
  const [content, setContentState] = useState(resume.content);
  const [settings, setSettingsState] = useState(resume.settings);
  const [templateId, setTemplateState] = useState<TemplateId>(resume.templateId);
  const [target, setTarget] = useState(initialTarget);
  const [credits, setCredits] = useState<number | null>(
    usage.ai_generation.max === null ? null : Math.max(0, usage.ai_generation.max - usage.ai_generation.used),
  );
  const save = useAutosave(resume.id, resume.revision);

  const report = useMemo(
    () => scoreResume(content, target ? { keywords: target.keywords, dismissed: target.dismissed } : null),
    [content, target],
  );

  // Refs hold the latest values so each edit is computed and queued once
  // (state updaters must stay pure; React may run them twice).
  const contentRef = useRef(content);
  const settingsRef = useRef(settings);
  const { queue } = save;
  const setContent = useCallback(
    (fn: (c: ResumeContent) => ResumeContent) => {
      const next = fn(contentRef.current);
      contentRef.current = next;
      setContentState(next);
      const lastScore = scoreResume(next, target ? { keywords: target.keywords, dismissed: target.dismissed } : null).total;
      queue({ content: next, lastScore });
    },
    [queue, target],
  );
  const setSettings = useCallback(
    (fn: (s: ResumeSettings) => ResumeSettings) => {
      const next = fn(settingsRef.current);
      settingsRef.current = next;
      setSettingsState(next);
      queue({ settings: next });
    },
    [queue],
  );
  const setTemplate = useCallback(
    (t: TemplateId) => {
      setTemplateState(t);
      queue({ templateId: t });
    },
    [queue],
  );
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.isQuota) upgrade(String(e.data.kind ?? ""));
      else toast({ tone: "error", title: errorMessage(e) });
    },
    [toast, upgrade],
  );

  const tabs = tabsFor(content);
  const tab = params.tab && tabs.includes(params.tab) ? params.tab : "contact";
  const base = `/app/resume/${resume.id}`;

  const sectionStatus = (t: string) => {
    const cs = report.checks.filter((c) => (t === "contact" ? c.id === "contact" : t === "summary" ? c.id === "summary" : c.sectionType === t));
    return cs.some((c) => c.severity === "error") ? "error" : cs.some((c) => c.severity === "warning") ? "warning" : null;
  };

  const ctx: EditorCtx = {
    resumeId: resume.id,
    name: resume.name,
    experienceLevel: resume.experienceLevel,
    content,
    settings,
    templateId,
    target,
    report,
    usage,
    credits,
    setContent,
    setSettings,
    setTemplate,
    setTarget,
    setCredits,
    flush: save.flush,
    fail,
  };

  function toggleSection(type: SectionType, on: boolean) {
    setContent((c) => {
      const s = c.sections.find((x) => x.type === type);
      if (s) return { ...c, sections: c.sections.map((x) => (x.type === type ? { ...x, hidden: !on } : x)) };
      return on ? { ...c, sections: [...c.sections, blankSection(type)] } : c;
    });
    if (on) router.push(`${base}/${type}`);
  }

  const b = band(report.total);
  const sectionChecks = report.checks.filter((c) =>
    tab === "contact" ? c.id === "contact" : tab === "summary" ? c.id === "summary" : c.sectionType === tab,
  );

  return (
    <EditorContext.Provider value={ctx}>
      <div className="flex min-h-dvh">
        <div className="sticky top-0 hidden h-dvh lg:block">
          <SidebarNav rail items={RAIL} current="/app" label="Main" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
            <div className="flex h-14 items-center gap-2 px-3 md:px-6">
              <Button asChild variant="ghost" size="sm" iconOnly aria-label="All resumes" className="lg:hidden">
                <Link href="/app">
                  <ArrowLeft aria-hidden className="size-4" />
                </Link>
              </Button>
              <label htmlFor="resume-switch" className="sr-only">
                Switch resume
              </label>
              <Select
                id="resume-switch"
                options={others.map((o) => ({ value: o.id, label: o.name }))}
                value={resume.id}
                onValueChange={async (id) => {
                  await save.flush().catch(() => {});
                  router.push(`/app/resume/${id}/${tab}`);
                }}
                className="h-9 max-w-[min(360px,50vw)] truncate border-transparent bg-transparent text-base font-semibold hover:bg-surface-muted"
              />
              <SaveIndicator status={save.status} onRetry={() => save.flush().catch(() => {})} />
              <div className="flex-1" />
              {tab !== "finish" && (
                <Button asChild size="sm" variant="secondary">
                  <Link href={`${base}/finish`}>
                    <Eye aria-hidden className="size-4" /> Preview<span className="hidden sm:inline">&nbsp;and download</span>
                  </Link>
                </Button>
              )}
            </div>
            <div className="flex items-end gap-1 px-1 md:px-4">
              <SectionNav
                className="min-w-0 flex-1"
                current={`${base}/${tab}`}
                items={tabs.map((t) => ({ href: `${base}/${t}`, label: TAB_LABEL[t], status: t === "finish" ? null : sectionStatus(t) }))}
              />
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="mb-1.5 shrink-0">
                    <Plus aria-hidden className="size-4" />
                    <span className="sr-only sm:not-sr-only">Sections</span>
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>Optional sections</MenuLabel>
                  {OPTIONAL.map((t) => (
                    <MenuCheckboxItem
                      key={t}
                      checked={content.sections.some((s) => s.type === t && !s.hidden)}
                      onCheckedChange={(on) => toggleSection(t, on)}
                    >
                      {SECTION_LABELS[t]}
                    </MenuCheckboxItem>
                  ))}
                </MenuContent>
              </Menu>
            </div>
          </header>

          <main id="main" className="flex flex-1 flex-col">
          {tab === "finish" ? (
            <Finish />
          ) : (
            <div className="mx-auto grid w-full max-w-(--layout-content-max) flex-1 gap-6 px-4 py-6 pb-28 md:px-6 lg:grid-cols-[var(--layout-editor-aside)_minmax(0,1fr)] lg:pb-10">
              <aside className="hidden flex-col gap-4 lg:flex" aria-label="Score and feedback">
                <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <ScoreRing score={report.total} size={48} />
                    <div>
                      <p className="text-sm font-semibold text-text">Resume score</p>
                      <p className="text-xs text-text-muted">{b.label}</p>
                    </div>
                  </div>
                  <Link href={`${base}/finish#score`} className={cn("mt-3 block text-sm font-medium text-text underline underline-offset-2", focusRing)}>
                    See the full report
                  </Link>
                </div>
                <SectionFeedback checks={sectionChecks} title={`${TAB_LABEL[tab]} feedback`} />
                <Link href={`${base}/finish`} className={cn("block rounded-lg border border-border bg-surface-muted p-3", focusRing)}>
                  <span className="sr-only">Open the preview</span>
                  <ScaledPage content={content} settings={settings} templateId={templateId} clip className="rounded-sm" />
                </Link>
              </aside>
              <div className="mx-auto w-full max-w-(--layout-form-max) min-w-0">
                {tab === "contact" && <ContactForm />}
                {(tab === "experience" || tab === "projects" || tab === "involvement") && <ExperienceForm type={tab} />}
                {tab === "education" && <EducationForm />}
                {tab === "skills" && <SkillsForm />}
                {(tab === "certifications" || tab === "coursework") && <SimpleForm type={tab} />}
                {tab === "summary" && <SummaryForm />}
                <div className="mt-6 lg:hidden">
                  <SectionFeedback checks={sectionChecks} title={`${TAB_LABEL[tab]} feedback`} />
                </div>
                <NextStep tabs={tabs} tab={tab} base={base} />
              </div>
            </div>
          )}
          </main>

          {tab !== "finish" && (
            <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-border bg-surface px-4 py-3 lg:hidden">
              <ScoreRing score={report.total} size={40} />
              <span className="flex-1 text-sm text-text">{b.label}</span>
              <Button asChild size="sm">
                <Link href={`${base}/finish`}>Preview</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
      <ConflictDialog status={save.status} onReload={() => window.location.reload()} />
    </EditorContext.Provider>
  );
}

function NextStep({ tabs, tab, base }: { tabs: string[]; tab: string; base: string }) {
  const next = tabs[tabs.indexOf(tab) + 1];
  if (!next) return null;
  return (
    <div className="mt-8 flex justify-end">
      <Button asChild variant="secondary">
        <Link href={`${base}/${next}`}>Next: {TAB_LABEL[next]}</Link>
      </Button>
    </div>
  );
}

export function SectionFeedback({ checks, title }: { checks: ScoreCheck[]; title: string }) {
  const issues = checks.filter((c) => c.severity !== "pass");
  const passed = checks.filter((c) => c.severity === "pass");
  if (!checks.length) return null;
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card" aria-label={title}>
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {issues.length === 0 && <p className="mt-1 text-sm text-success">Nothing to fix here.</p>}
      <CheckList>
        {issues.map((c) => (
          <CheckItem key={c.id} severity={c.severity} title={c.entryLabel ? `${c.title} · ${c.entryLabel}` : c.title}>
            {c.detail}
          </CheckItem>
        ))}
      </CheckList>
      {passed.length > 0 && <p className="mt-2 text-xs text-text-muted">{passed.length} checks passed.</p>}
    </section>
  );
}

function ConflictDialog({ status, onReload }: { status: SaveStatus; onReload: () => void }) {
  return (
    <Dialog open={status === "conflict"}>
      <DialogContent
        title="This resume changed in another tab"
        description="Your latest edits here weren’t saved, so nothing is overwritten by accident."
        footer={<Button onClick={onReload}>Load the latest version</Button>}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <p className="text-sm text-text-muted">Reload to see the saved version. Copy anything from this tab you want to keep first.</p>
      </DialogContent>
    </Dialog>
  );
}
