"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { RadioCard, RadioCardGroup } from "@/components/ui/toggles";
import { Switch } from "@/components/ui/toggles";
import { EXPERIENCE_LEVELS } from "@/lib/resume/schema";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { ProfileDoc } from "@/server/repo/types";
import { useUpgrade } from "./upgrade";

type Errors = Partial<Record<"name" | "level" | "title" | "description" | "form", string>>;

/**
 * "New resume" (S12). With a saved profile it only asks for the job: the
 * resume starts as a copy of the profile, tailored to the ad's keywords.
 * Without one it offers to set the profile up, or to start blank.
 */
export function CreateResumeButton({
  className,
  atLimit,
  variant = "primary",
  label = "New resume",
  openOnParam = false,
}: {
  className?: string;
  atLimit?: boolean;
  variant?: "primary" | "secondary";
  label?: string;
  /** Open by itself when the page URL has ?new=1 (from the profile page). */
  openOnParam?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const upgrade = useUpgrade();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileDoc | null>();
  const [from, setFrom] = useState<"profile" | "blank">("profile");
  const [hasAd, setHasAd] = useState(true);
  const [name, setName] = useState("");
  const [level, setLevel] = useState<string>();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const hasProfile = Boolean(profile?.content);
  const needLevel = !(from === "profile" && hasProfile && profile?.experienceLevel);

  function show() {
    if (atLimit) return upgrade("resume");
    setErrors({});
    setOpen(true);
    api<{ profile: ProfileDoc }>("/api/profile")
      .then(({ profile }) => {
        setProfile(profile);
        setFrom(profile.content ? "profile" : "blank");
      })
      .catch(() => setProfile(null));
  }

  useEffect(() => {
    if (openOnParam && params.get("new") === "1") {
      router.replace("/app", { scroll: false });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- opening on arrival from the profile page
      show();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnParam, params]);

  function validate(): Errors {
    const e: Errors = {};
    if (hasAd) {
      if (!title.trim()) e.title = "Add the job title from the ad.";
      if (description.trim().length < 50) e.description = "Paste the whole job ad so we can pick out its keywords.";
    } else if (!name.trim()) e.name = "Give it a name you’ll recognise.";
    if (needLevel && !level) e.level = "Choose the level closest to where you are now.";
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
          from,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(needLevel ? { experienceLevel: level } : {}),
          language: "en-US",
          target: hasAd ? { title: title.trim(), company: company.trim(), description: description.trim() } : undefined,
        },
      });
      setOpen(false);
      // From the profile, everything is filled in already: go straight to the job match.
      router.push(`/app/resume/${id}/${from === "profile" && hasProfile ? (hasAd ? "finish#keywords" : "finish") : "contact"}`);
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
    <Dialog open={open} onOpenChange={(o) => (o ? show() : setOpen(false))}>
      <Button variant={variant} className={className} onClick={show}>
        <Plus aria-hidden className="size-4" /> {label}
      </Button>
      <DialogContent
        title="New resume"
        description={hasProfile ? "Tell us about the job. Your details come from your profile." : "Tell us about the job. You can change all of this later."}
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
            <Button type="submit" form="create-resume" loading={busy} disabled={profile === undefined}>
              Create resume
            </Button>
          </>
        }
      >
        <form id="create-resume" onSubmit={submit} noValidate className="flex flex-col gap-5">
          {profile !== undefined && !hasProfile && (
            <div className="flex items-start gap-3 rounded-md border border-border bg-surface-muted p-3">
              <UserRound aria-hidden className="mt-0.5 size-5 shrink-0 text-text-muted" />
              <p className="text-sm text-text">
                Set up your profile once, by uploading your resume or filling it in, and every new resume starts from it.{" "}
                <Link href="/app/profile" className="font-medium underline underline-offset-2" onClick={() => setOpen(false)}>
                  Set up your profile
                </Link>
              </p>
            </div>
          )}

          {hasProfile && (
            <RadioCardGroup value={from} onValueChange={(v) => setFrom(v as "profile" | "blank")} aria-label="Start from">
              <RadioCard value="profile" title="Start from my profile" description="Your contact details, experience, education and skills, ready to tailor" />
              <RadioCard value="blank" title="Start blank" description="An empty resume" />
            </RadioCardGroup>
          )}

          <div className="rounded-md border border-border p-4">
            <Switch label="I have a job ad" checked={hasAd} onCheckedChange={setHasAd} className="w-full justify-between" />
            <p className="mt-1 text-xs text-text-muted">We’ll pick out the ad’s keywords and show which ones your resume is missing.</p>
            {hasAd && (
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Job title" required error={errors.title}>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
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

          <Field
            label={hasAd ? "Resume name (optional)" : "Resume name"}
            required={!hasAd}
            error={errors.name}
            helper={hasAd ? "Leave it empty and we’ll name it after the job." : "Only you see this. For example: “Product Designer – general”."}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={hasAd ? "Your name – Job title at Company" : undefined} />
          </Field>

          {needLevel && profile !== undefined && (
            <Field label="Experience level" required error={errors.level} helper="Tunes the tips and the AI suggestions.">
              <Select options={[...EXPERIENCE_LEVELS]} value={level} onValueChange={setLevel} placeholder="Choose a level" />
            </Field>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
