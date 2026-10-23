"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { Field, Input } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/tabs";
import { Dialog, DialogContent, useToast } from "@/components/ui/overlays";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Usage, User } from "@/server/repo/types";
import { UsageBox } from "./app-sidebar";
import { BillingCard, type BillingView } from "./billing";

type Theme = "system" | "light" | "dark";
function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const readTheme = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? "system";

function Row({ title, body, children }: { title: string; body?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-5 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div className="max-w-md">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        {body && <p className="mt-1 text-sm text-text-muted">{body}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** One-off messages for where the user came back from: Stripe, or an email link. */
function useArrivalToast() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const billing = params.get("billing");
  const email = params.get("email");
  useEffect(() => {
    if (billing === "success") {
      toast({ tone: "success", title: "Payment received. Thanks for going Pro." });
      // The plan is set by Stripe's webhook, a moment after the redirect.
      const t = setTimeout(() => router.refresh(), 2500);
      router.replace("/app/settings", { scroll: false });
      return () => clearTimeout(t);
    }
    if (email === "changed") {
      toast({ tone: "success", title: "Email changed. Use the new one to log in." });
      router.replace("/app/settings", { scroll: false });
    }
  }, [billing, email, router, toast]);
}

function ChangeEmail({ current }: { current: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter an email address like name@example.com.");
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/me/email", { body: { email: email.trim() } });
      setOpen(false);
      toast({ tone: "success", title: `Check your email. Your address changes to ${email.trim()} once you confirm.` });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "email_taken"
          ? "Another account already uses that email."
          : err instanceof ApiError && err.code === "same_email"
            ? "That’s already your email."
            : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Row title="Email" body={current}>
      <Button variant="secondary" onClick={() => (setEmail(""), setError(undefined), setOpen(true))}>
        Change email
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Change your email"
          description="We’ll email you a link to confirm. Nothing changes until you click it."
          className="max-w-[440px]"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="change-email" loading={busy}>
                Send link
              </Button>
            </>
          }
        >
          <form id="change-email" onSubmit={submit} noValidate>
            <Field label="New email" error={error}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={160} autoFocus />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </Row>
  );
}

export function SettingsForms({ user, usage, billing }: { user: User; usage: Usage; billing: BillingView }) {
  const router = useRouter();
  const toast = useToast();
  useArrivalToast();
  const [signingOut, setSigningOut] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  const [name, setName] = useState(user.fullName);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string>();

  function pickTheme(t: Theme) {
    const el = document.documentElement;
    if (t === "system") delete el.dataset.theme;
    else el.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    api("/api/me", { method: "PATCH", body: { theme: t } }).catch(() => {});
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api("/api/me", { method: "PATCH", body: { fullName: name.trim() } });
      toast({ tone: "success", title: "Name saved" });
      router.refresh();
    } catch (err) {
      toast({ tone: "error", title: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDelError(undefined);
    try {
      await api("/api/me", { method: "DELETE", body: { confirmEmail } });
      router.push("/");
      router.refresh();
    } catch {
      setDelError("Type your email exactly as shown.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl text-text">Settings</h1>

      <Card>
        <h2 className="text-lg text-text">Account</h2>
        <form onSubmit={saveName} className="flex flex-col gap-3 border-b border-border py-5 md:flex-row md:items-end">
          <Field label="Your name" className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            Save name
          </Button>
        </form>
        <ChangeEmail current={user.email} />
        <Row title="Password" body="Choose a new one. Other devices are signed out when you do.">
          <Button asChild variant="secondary">
            <Link href="/reset-password">Change password</Link>
          </Button>
        </Row>
        <Row title="Sign out everywhere" body="Ends every session on every device, including this one. Useful if you used a shared computer.">
          <Button
            variant="secondary"
            loading={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await api("/api/auth/logout", { body: { everywhere: true } });
                router.push("/login");
                router.refresh();
              } catch (e) {
                toast({ tone: "error", title: errorMessage(e) });
                setSigningOut(false);
              }
            }}
          >
            Sign out everywhere
          </Button>
        </Row>
      </Card>

      <Card>
        <h2 className="text-lg text-text">Appearance</h2>
        <Row title="Theme" body="System follows your device’s light or dark setting.">
          <SegmentedControl
            aria-label="Theme"
            value={theme}
            onValueChange={(v) => pickTheme(v as Theme)}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
      </Card>

      <Card id="billing" className="scroll-mt-20">
        <h2 className="text-lg text-text">Plan</h2>
        <BillingCard billing={billing} />
        <div className="max-w-sm pt-2">
          <UsageBox usage={usage} />
        </div>
      </Card>

      <Card className="border-danger">
        <h2 className="text-lg text-danger">Delete account</h2>
        <Row title="Delete your account and every resume" body="This can’t be undone. Download anything you want to keep first.">
          <Button variant="danger" onClick={() => setDel(true)}>
            Delete account
          </Button>
        </Row>
      </Card>

      <Dialog open={del} onOpenChange={setDel}>
        <DialogContent
          title="Delete your account?"
          description="Your resumes, job ads and settings are removed for good."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDel(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleting} disabled={confirmEmail.trim().toLowerCase() !== user.email} onClick={deleteAccount}>
                Delete everything
              </Button>
            </>
          }
        >
          <Field label={`Type ${user.email} to confirm`} error={delError}>
            <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />
          </Field>
        </DialogContent>
      </Dialog>
    </div>
  );
}
