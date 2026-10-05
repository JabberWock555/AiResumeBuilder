"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileText, MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/tabs";
import { ConfirmDialog, Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, useToast } from "@/components/ui/overlays";
import { ScoreRing } from "@/components/ui/score";
import { ScaledPage } from "@/components/resume/scaled-page";
import { ApiError, api, errorMessage } from "@/lib/api";
import { scoreResume } from "@/lib/score";
import { timeAgo } from "@/lib/time";
import { cn, focusRing } from "@/lib/cn";
import type { ResumeSummary } from "@/server/repo/types";
import { CreateResumeButton } from "./create-resume";
import { useUpgrade } from "./upgrade";

const SORTS = [
  { value: "created", label: "Newest first" },
  { value: "updated", label: "Last edited" },
  { value: "name", label: "Name" },
];

// Grid or list, remembered per browser.
const VIEW_KEY = "resume-view";
const viewListeners = new Set<() => void>();
function readView(): "grid" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}
function setView(v: string) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {}
  viewListeners.forEach((l) => l());
}
const subscribeView = (l: () => void) => (viewListeners.add(l), () => viewListeners.delete(l));

export function ResumeList({
  resumes,
  sort,
  firstName,
  atLimit,
}: {
  resumes: ResumeSummary[];
  sort: string;
  firstName: string;
  atLimit: boolean;
}) {
  const router = useRouter();
  const view = useSyncExternalStore(subscribeView, readView, () => "grid" as const);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text">{firstName ? `Hi, ${firstName}` : "Your resumes"}</h1>
          <p className="mt-1 text-base text-text-muted">
            {resumes.length ? "Pick up where you left off, or tailor a copy for a new job." : "Let’s build your first resume."}
          </p>
        </div>
        <CreateResumeButton atLimit={atLimit} />
      </div>

      {resumes.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg text-text">
            Resumes <span className="font-normal text-text-muted">({resumes.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="sr-only">
              Sort resumes
            </label>
            <Select id="sort" options={SORTS} value={sort} onValueChange={(v) => router.replace(v === "created" ? "/app" : `/app?sort=${v}`)} className="h-10 w-40" />
            <SegmentedControl
              aria-label="Layout"
              value={view}
              onValueChange={setView}
              options={[
                { value: "grid", label: "Grid" },
                { value: "list", label: "List" },
              ]}
            />
          </div>
        </div>
      )}

      {resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          body="Start from scratch. You can tailor it to a job ad as you go."
          action={<CreateResumeButton atLimit={atLimit} label="Create your first resume" />}
        />
      ) : (
        <ul className={cn(view === "grid" ? "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "flex flex-col gap-2")}>
          {resumes.map((r) => (
            <ResumeCard key={r.id} r={r} view={view} atLimit={atLimit} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResumeCard({ r, view, atLimit }: { r: ResumeSummary; view: "grid" | "list"; atLimit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const upgrade = useUpgrade();
  const [confirm, setConfirm] = useState(false);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(r.name);
  const [busy, setBusy] = useState(false);
  const score = r.lastScore ?? scoreResume(r.content).total;
  const href = `/app/resume/${r.id}/contact`;

  async function duplicate() {
    if (atLimit) return upgrade("resume");
    try {
      const { id } = await api<{ id: string }>(`/api/resumes/${r.id}/duplicate`, { body: {} });
      toast({ tone: "success", title: "Copy created" });
      router.push(`/app/resume/${id}/contact`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.isQuota) upgrade("resume");
      else toast({ tone: "error", title: errorMessage(e) });
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/resumes/${r.id}`, { method: "DELETE" });
      setConfirm(false);
      toast({ tone: "success", title: "Resume deleted" });
      router.refresh();
    } catch (e) {
      toast({ tone: "error", title: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api(`/api/resumes/${r.id}`, { method: "PATCH", body: { revision: r.revision, name: name.trim() } });
      setRename(false);
      router.refresh();
    } catch (err) {
      toast({ tone: "error", title: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const menu = (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" iconOnly aria-label={`Actions for ${r.name}`}>
          <MoreHorizontal aria-hidden className="size-4" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => setRename(true)}>
          <Pencil aria-hidden className="size-4" /> Rename
        </MenuItem>
        <MenuItem onSelect={duplicate}>
          <Copy aria-hidden className="size-4" /> Make a copy
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive onSelect={() => setConfirm(true)}>
          <Trash2 aria-hidden className="size-4" /> Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  const meta = (
    <span className="flex items-center gap-2 text-xs text-text-muted">
      Edited {timeAgo(r.updatedAt)}
      {r.hasTarget && (
        <Badge tone="neutral" className="gap-1">
          <Target aria-hidden className="size-3" /> Tailored
        </Badge>
      )}
    </span>
  );

  return (
    <li className="min-w-0">
      {view === "grid" ? (
        <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          <Link href={href} className={cn("block bg-surface-muted p-4", focusRing)} tabIndex={-1}>
            <span className="sr-only">Open {r.name}</span>
            <ScaledPage content={r.content} settings={r.settings} templateId={r.templateId} clip className="rounded-sm shadow-card" />
          </Link>
          <div className="flex items-start gap-3 border-t border-border p-3">
            <ScoreRing score={score} size={40} label={`Score for ${r.name}`} />
            <div className="min-w-0 flex-1">
              <Link href={href} className={cn("block truncate text-sm font-semibold text-text hover:underline", focusRing)} title={r.name}>
                {r.name}
              </Link>
              {meta}
            </div>
            {menu}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-3 shadow-card">
          <ScoreRing score={score} size={40} label={`Score for ${r.name}`} />
          <div className="min-w-0 flex-1">
            <Link href={href} className={cn("block truncate text-base font-semibold text-text hover:underline", focusRing)} title={r.name}>
              {r.name}
            </Link>
            {meta}
          </div>
          {menu}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${r.name}”?`}
        description="The resume and its job ad are removed."
        confirmLabel="Delete resume"
        onConfirm={remove}
        loading={busy}
      />
      <Dialog open={rename} onOpenChange={setRename}>
        <DialogContent
          title="Rename resume"
          footer={
            <>
              <Button variant="ghost" onClick={() => setRename(false)}>
                Cancel
              </Button>
              <Button type="submit" form={`rename-${r.id}`} loading={busy}>
                Save
              </Button>
            </>
          }
        >
          <form id={`rename-${r.id}`} onSubmit={saveName}>
            <Field label="Name" required error={name.trim() ? undefined : "The name can’t be empty."}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}
