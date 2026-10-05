"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/toggles";
import { EXPERIENCE_LEVELS } from "@/lib/resume/schema";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useUpgrade } from "./upgrade";

type Errors = Partial<Record<"name" | "level" | "title" | "description" | "form", string>>;

/** "New resume" button + the create dialog (S12). */
export function CreateResumeButton({
  className,
  atLimit,
  variant = "primary",
  label = "New resume",
}: {
  className?: string;
  atLimit?: boolean;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const router = useRouter();
  const upgrade = useUpgrade();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [level, setLevel] = useState<string>();
  const [target, setTarget] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = "Give it a name you'll recognise, like the job you're applying for.";
    if (!level) e.level = "Choose the level closest to where you are now.";
    if (target && !title.trim()) e.title = "Add the job title from the ad.";
    if (target && description.trim().length < 50) e.description = "Paste the whole job ad so we can pick out its keywords.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/resumes", {
        body: {
          name: name.trim(),
          experienceLevel: level,
          language: "en-US",
          target: target ? { title: title.trim(), company: company.trim(), description: description.trim() } : undefined,
        },
      });
      setOpen(false);
      router.push(`/app/resume/${id}/contact`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.isQuota) {
        setOpen(false);
        upgrade("resume");
      } else setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o && atLimit) return upgrade("resume");
        setOpen(o);
        if (o) setErrors({});
      }}
    >
      <Button variant={variant} className={className} onClick={() => (atLimit ? upgrade("resume") : setOpen(true))}>
        <Plus aria-hidden className="size-4" /> {label}
      </Button>
      <DialogContent
        title="New resume"
        description="You can change all of this later."
        footer={
          <>
            {errors.form && (
              <p role="alert" className="mr-auto text-sm text-danger">
                {errors.form}
              </p>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-resume" loading={busy}>
              Create resume
            </Button>
          </>
        }
      >
        <form id="create-resume" onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Field label="Resume name" required error={errors.name} helper="Only you see this. For example: “Product Designer – Fernway”.">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder="Your name – Target role" />
          </Field>
          <Field label="Experience level" required error={errors.level} helper="Tunes the tips and the AI suggestions.">
            <Select options={[...EXPERIENCE_LEVELS]} value={level} onValueChange={setLevel} placeholder="Choose a level" />
          </Field>
          <div className="rounded-md border border-border p-4">
            <Switch label="Tailor it to a job ad" checked={target} onCheckedChange={setTarget} className="w-full justify-between" />
            <p className="mt-1 text-xs text-text-muted">We’ll pick out the ad’s keywords and show which ones your resume is missing.</p>
            {target && (
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Job title" required error={errors.title}>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                  </Field>
                  <Field label="Company">
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
                  </Field>
                </div>
                <Field label="Job ad" required error={errors.description} helper="Paste the whole ad, including the requirements.">
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={20000} className="max-h-60 overflow-y-auto" />
                </Field>
              </div>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
