"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, Plus, Upload, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SectionNav } from "@/components/ui/tabs";
import { Dialog, DialogContent, Menu, MenuCheckboxItem, MenuContent, MenuLabel, MenuTrigger, useToast } from "@/components/ui/overlays";
import { ScaledPage } from "@/components/resume/scaled-page";
import { EditorContext, type EditorCtx } from "@/components/editor/context";
import { takeDraft, useAutosave } from "@/components/editor/autosave";
import { OPTIONAL, SaveIndicator, SectionFeedback, tabsFor } from "@/components/editor/editor";
import { ContactForm } from "@/components/editor/contact";
import { ExperienceForm } from "@/components/editor/experience";
import { EducationForm, SimpleForm, SkillsForm } from "@/components/editor/other-sections";
import { SummaryForm } from "@/components/editor/summary";
import { ApiError, errorMessage } from "@/lib/api";
import { scoreResume } from "@/lib/score";
import {
  DEFAULT_SETTINGS,
  EXPERIENCE_LEVELS,
  SECTION_LABELS,
  blankContent,
  blankSection,
  type ExperienceLevel,
  type ResumeContent,
  type SectionType,
} from "@/lib/resume/schema";
import type { ProfileDoc, Usage } from "@/server/repo/types";
import { useUpgrade } from "./upgrade";

// The saved profile (entered once, copied into each new resume). Same section
// forms, AI writer and autosave as the resume editor, on one document per user.

const LABEL: Record<string, string> = { contact: "Contact", summary: "Summary", ...SECTION_LABELS };
type Found = { name: boolean; email: boolean; roles: number; education: number; skills: number; summary: boolean };

const IMPORT_ERRORS: Record<string, string> = {
  wrong_type: "That isn’t a PDF or Word (.docx) file. Save it as one of those and try again.",
  too_big: "That file is over 5 MB. Try a smaller copy, or one without images.",
  no_text: "We couldn’t find any text in that file. It may be a scan or a picture: try the Word version, or fill your profile in yourself.",
  too_long: "That file is longer than 10 pages. Upload just your resume.",
  unreadable: "We couldn’t read that file. It may be damaged or password-protected.",
};

/** Upload a PDF or Word resume; resolves with what was found in it. */
function useImport(onDone: (content: ResumeContent, found: Found) => void) {
  const upgrade = useUpgrade();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();
  async function upload(file: File) {
    setBusy(true);
    setError(undefined);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/import", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) return upgrade("import");
      if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data);
      onDone(data.content, data.found);
    } catch (e) {
      setError(e instanceof ApiError ? (IMPORT_ERRORS[e.code] ?? errorMessage(e)) : errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  const field = (
    <input
      ref={input}
      type="file"
      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      className="sr-only"
      aria-label="Resume file (PDF or Word)"
      onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
    />
  );
  return { busy, error, pick, field };
}

function foundText(f: Found) {
  const parts = [
    f.roles && `${f.roles} ${f.roles === 1 ? "role" : "roles"}`,
    f.education && `${f.education} ${f.education === 1 ? "school" : "schools"}`,
    f.skills && `${f.skills} ${f.skills === 1 ? "skill" : "skills"}`,
    f.summary && "a summary",
  ].filter(Boolean);
  return parts.length ? `We found ${parts.join(", ")}. Check each section: files don’t always read perfectly.` : "We couldn’t pick out much from that file. Fill in the sections below.";
}

export function ProfileEditor({ profile, user, usage }: { profile: ProfileDoc; user: { id: string; fullName: string; email: string }; usage: Usage }) {
  const router = useRouter();
  const toast = useToast();
  const upgrade = useUpgrade();
  const params = useSearchParams();
  const save = useAutosave(`profile-${user.id}`, profile.revision, 800, "/api/profile");
  const { queue } = save;
  const [content, setContentState] = useState<ResumeContent | null>(profile.content);
  const [level, setLevel] = useState<ExperienceLevel | null>(profile.experienceLevel);
  const [credits, setCredits] = useState<number | null>(
    usage.ai_generation.max === null ? null : Math.max(0, usage.ai_generation.max - usage.ai_generation.used),
  );
  const [found, setFound] = useState<Found | null>(null);
  const [replace, setReplace] = useState<{ content: ResumeContent; found: Found } | null>(null);
  const contentRef = useRef(content);

  const setContent = useCallback(
    (fn: (c: ResumeContent) => ResumeContent) => {
      const next = fn(contentRef.current ?? blankContent());
      contentRef.current = next;
      setContentState(next);
      queue({ content: next });
    },
    [queue],
  );

  // Edits that couldn't be saved last time come back from this device.
  useEffect(() => {
    const draft = takeDraft(`profile-${user.id}`, profile.revision);
    if (!draft || draft === "stale" || !draft.patch.content) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage, which the server render can't see */
    setContentState(draft.patch.content);
    contentRef.current = draft.patch.content;
    queue(draft.patch);
    toast({ tone: "info", title: "Restored profile edits that hadn’t been saved." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start(next: ResumeContent, f?: Found) {
    contentRef.current = next;
    setContentState(next);
    queue({ content: next, ...(level ? {} : { experienceLevel: "entry" as const }) });
    if (!level) setLevel("entry");
    if (f) setFound(f);
    router.replace("/app/profile?tab=contact", { scroll: false });
  }

  const imp = useImport((c, f) => (contentRef.current ? setReplace({ content: c, found: f }) : start(c, f)));

  const report = useMemo(() => scoreResume(content ?? blankContent(), null), [content]);
  const tabs = tabsFor(content ?? blankContent()).filter((t) => t !== "finish");
  const tab = tabs.includes(params.get("tab") ?? "") ? params.get("tab")! : "contact";

  // ---------------------------------------------------------------- setup
  if (!content) {
    const blank = () => {
      const c = blankContent();
      c.contact.fullName = user.fullName;
      c.contact.email = user.email;
      start(c);
    };
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl text-text">Set up your profile</h1>
          <p className="mt-1 max-w-2xl text-base text-text-muted">
            Enter your details once. Every new resume starts from your profile, so for each job you only add the job ad.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <Upload aria-hidden className="size-6 text-text-muted" />
            <h2 className="text-lg text-text">Upload your resume</h2>
            <p className="text-sm text-text-muted">A PDF or Word file, up to 5 MB. We read it into your profile so you can check and fix it. The file itself isn’t kept.</p>
            {imp.field}
            <Button className="mt-auto self-start" loading={imp.busy} onClick={imp.pick}>
              Choose a file
            </Button>
            {imp.error && (
              <p role="alert" className="text-sm text-danger">
                {imp.error}
              </p>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <UserRound aria-hidden className="size-6 text-text-muted" />
            <h2 className="text-lg text-text">Fill it in yourself</h2>
            <p className="text-sm text-text-muted">Contact details, experience, education and skills. It saves as you type.</p>
            <Button variant="secondary" className="mt-auto self-start" onClick={blank}>
              Start with a blank profile
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- editor
  const ctx: EditorCtx = {
    resumeId: "profile",
    name: "Your profile",
    experienceLevel: level ?? "entry",
    content,
    settings: DEFAULT_SETTINGS,
    templateId: "standard",
    target: null,
    report,
    usage,
    credits,
    setContent,
    setSettings: () => {},
    setTemplate: () => {},
    setTarget: () => {},
    setCredits,
    flush: save.flush,
    fail: (e) => (e instanceof ApiError && e.isQuota ? upgrade(String(e.data.kind ?? "")) : toast({ tone: "error", title: errorMessage(e) })),
  };
  const sectionChecks = report.checks.filter((c) => (tab === "contact" ? c.id === "contact" : tab === "summary" ? c.id === "summary" : c.sectionType === tab));
  const sectionStatus = (t: string) => {
    const cs = report.checks.filter((c) => (t === "contact" ? c.id === "contact" : t === "summary" ? c.id === "summary" : c.sectionType === t));
    return cs.some((c) => c.severity === "error") ? "error" : cs.some((c) => c.severity === "warning") ? "warning" : null;
  };
  function toggleSection(type: SectionType, on: boolean) {
    setContent((c) => {
      const s = c.sections.find((x) => x.type === type);
      if (s) return { ...c, sections: c.sections.map((x) => (x.type === type ? { ...x, hidden: !on } : x)) };
      return on ? { ...c, sections: [...c.sections, blankSection(type)] } : c;
    });
    if (on) router.push(`/app/profile?tab=${type}`, { scroll: false });
  }

  return (
    <EditorContext.Provider value={ctx}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl text-text">Your profile</h1>
              <SaveIndicator status={save.status} onRetry={() => save.flush().catch(() => {})} />
            </div>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">New resumes start from this. Resumes you’ve already made keep their own copy, so changes here don’t alter them.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {imp.field}
            <Button variant="secondary" loading={imp.busy} onClick={imp.pick}>
              <Upload aria-hidden className="size-4" /> Import from a resume
            </Button>
            <Button asChild>
              <Link href="/app?new=1">
                <FilePlus2 aria-hidden className="size-4" /> New resume for a job
              </Link>
            </Button>
          </div>
        </div>
        {imp.error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {imp.error}
          </p>
        )}
        {found && (
          <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
            {foundText(found)}
          </p>
        )}
        {save.status === "conflict" && (
          <p role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            Your profile changed in another tab, so these edits weren’t saved.
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Load the latest version
            </Button>
          </p>
        )}

        <div className="max-w-xs">
          <Field label="Experience level" helper="Used for new resumes and the AI suggestions.">
            <Select
              options={[...EXPERIENCE_LEVELS]}
              value={level ?? undefined}
              placeholder="Choose a level"
              onValueChange={(v) => {
                setLevel(v as ExperienceLevel);
                queue({ experienceLevel: v as ExperienceLevel });
              }}
            />
          </Field>
        </div>

        <div className="flex items-end gap-1 border-b border-border">
          <SectionNav
            label="Profile sections"
            className="min-w-0 flex-1 [&_ul]:border-b-0"
            current={`/app/profile?tab=${tab}`}
            items={tabs.map((t) => ({ href: `/app/profile?tab=${t}`, label: LABEL[t], status: sectionStatus(t) }))}
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
                <MenuCheckboxItem key={t} checked={content.sections.some((s) => s.type === t && !s.hidden)} onCheckedChange={(on) => toggleSection(t, on)}>
                  {SECTION_LABELS[t]}
                </MenuCheckboxItem>
              ))}
            </MenuContent>
          </Menu>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--layout-editor-aside)]">
          <div className="mx-auto w-full max-w-(--layout-form-max) min-w-0">
            {tab === "contact" && <ContactForm />}
            {(tab === "experience" || tab === "projects" || tab === "involvement") && <ExperienceForm type={tab} />}
            {tab === "education" && <EducationForm />}
            {tab === "skills" && <SkillsForm />}
            {(tab === "certifications" || tab === "coursework") && <SimpleForm type={tab} />}
            {tab === "summary" && <SummaryForm />}
          </div>
          <aside className="flex flex-col gap-4" aria-label="Profile feedback and preview">
            <SectionFeedback checks={sectionChecks} title={`${LABEL[tab]} feedback`} />
            <div className="hidden rounded-lg border border-border bg-surface-muted p-3 lg:block">
              <ScaledPage content={content} settings={DEFAULT_SETTINGS} templateId="standard" clip className="rounded-sm" />
            </div>
          </aside>
        </div>
      </div>

      <Dialog open={Boolean(replace)} onOpenChange={(o) => !o && setReplace(null)}>
        <DialogContent
          title="Replace your profile with this file?"
          description="Everything in your profile is replaced by what we read from the file. Resumes you’ve already made don’t change."
          className="max-w-[460px]"
          footer={
            <>
              <Button variant="secondary" onClick={() => setReplace(null)}>
                Keep my profile
              </Button>
              <Button
                onClick={() => {
                  if (replace) start(replace.content, replace.found);
                  setReplace(null);
                }}
              >
                Replace it
              </Button>
            </>
          }
        >
          {replace && <p className="text-sm text-text-muted">{foundText(replace.found)}</p>}
        </DialogContent>
      </Dialog>
    </EditorContext.Provider>
  );
}
