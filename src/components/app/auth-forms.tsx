"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api, errorMessage } from "@/lib/api";

export type OAuthProvider = "google" | "apple";
const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

function safeNext(n: string | null) {
  return n && n.startsWith("/app") ? n : "/app";
}

function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

const LINK_ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Ask for a new one below.",
  oauth: "That sign-in didn't finish. Try again, or use your email and password.",
  provider: "That sign-in option isn't available yet. Use your email and password.",
};

/** "Continue with Google / Apple", shown only for providers switched on in Supabase. */
function OAuthButtons({ providers }: { providers: OAuthProvider[] }) {
  if (!providers.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <Button key={p} asChild variant="secondary" size="lg">
          {/* A plain link: the route redirects to the provider, so there's nothing to prefetch. */}
          <a href={`/auth/oauth/${p}`}>Continue with {PROVIDER_LABEL[p]}</a>
        </Button>
      ))}
      <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

/** Shown after sign-up, and when someone tries to log in before confirming. */
function CheckInbox({ email, onBack }: { email: string; onBack?: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  async function resend() {
    setState("busy");
    try {
      await api("/api/auth/resend", { body: { email } });
      setState("sent");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="flex flex-col gap-4" role="status">
      <MailCheck aria-hidden className="size-8 text-success" />
      <h1 className="text-xl text-text">Check your email</h1>
      <p className="text-sm text-text-muted">
        We’ve sent a link to <b className="text-text">{email}</b>. Click it to confirm your address and you’re in. It works for 24 hours.
      </p>
      <p className="text-sm text-text-muted">Nothing there? Check spam, or send it again.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" loading={state === "busy"} disabled={state === "sent"} onClick={resend}>
          {state === "sent" ? "Sent again" : "Send it again"}
        </Button>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            Use a different email
          </Button>
        )}
      </div>
      {state === "error" && <FormError>Couldn’t send it just now. Wait a few minutes and try again.</FormError>}
    </div>
  );
}

export function SignupForm({ providers }: { providers: OAuthProvider[] }) {
  const [fullName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!fullName.trim()) er.fullName = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) er.email = "Enter an email address like name@example.com.";
    if (password.length < 10) er.password = "Use at least 10 characters.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api("/api/auth/signup", { body: { fullName, email: email.trim(), password } });
      setSentTo(email.trim());
    } catch (err) {
      const pw = err instanceof ApiError && (err.data.issues as { fieldErrors?: { password?: string[] } })?.fieldErrors?.password?.[0];
      setErrors(pw ? { password: pw } : { form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) return <CheckInbox email={sentTo} onBack={() => setSentTo(undefined)} />;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl text-text">Create your account</h1>
        <p className="mt-1 text-sm text-text-muted">Free to start. No card needed.</p>
      </div>
      <OAuthButtons providers={providers} />
      <FormError>{errors.form}</FormError>
      <Field label="Your name" error={errors.fullName}>
        <Input value={fullName} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={160} />
      </Field>
      <Field label="Password" error={errors.password} helper="At least 10 characters.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={200} />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Create account
      </Button>
      <p className="text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-text underline underline-offset-2">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({ providers }: { providers: OAuthProvider[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(LINK_ERRORS[params.get("error") ?? ""]);
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/auth/login", { body: { email: email.trim(), password } });
      router.push(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_not_verified") setUnverified(true);
      else setError(err instanceof ApiError && err.code === "bad_credentials" ? "That email and password don’t match an account." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (unverified) return <CheckInbox email={email.trim()} onBack={() => setUnverified(false)} />;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl text-text">Welcome back</h1>
        <p className="mt-1 text-sm text-text-muted">Log in to keep working on your resumes.</p>
      </div>
      <OAuthButtons providers={providers} />
      <FormError>{error}</FormError>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Field
        label="Password"
        trailing={
          <Link href="/forgot-password" className="text-sm text-text-muted underline underline-offset-2 hover:text-text">
            Forgot it?
          </Link>
        }
      >
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Log in
      </Button>
      <p className="text-center text-sm text-text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-text underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(LINK_ERRORS[params.get("error") ?? ""]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return setError("Enter the email you signed up with.");
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/auth/forgot", { body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <div className="flex flex-col gap-3" role="status">
        <h1 className="text-xl text-text">Check your email</h1>
        <p className="text-sm text-text-muted">If there’s an account for {email}, we’ve sent a link to reset the password. It works for an hour.</p>
        <Link href="/login" className="text-sm font-medium text-text underline underline-offset-2">
          Back to log in
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl text-text">Reset your password</h1>
        <p className="mt-1 text-sm text-text-muted">We’ll email you a link to choose a new one.</p>
      </div>
      <FormError>{error}</FormError>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Send reset link
      </Button>
    </form>
  );
}

/** Reached from the emailed link (which signs the user in) or from Settings. */
export function ResetForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!signedIn)
    return (
      <div className="flex flex-col gap-3" role="status">
        <h1 className="text-xl text-text">This link has expired</h1>
        <p className="text-sm text-text-muted">Reset links work once, for an hour. Ask for a new one and use the latest email.</p>
        <Button asChild>
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </div>
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    setBusy(true);
    try {
      await api("/api/auth/reset", { body: { password } });
      router.push("/app?password=changed");
      router.refresh();
    } catch (err) {
      const pw = err instanceof ApiError && (err.data.issues as { fieldErrors?: { password?: string[] } })?.fieldErrors?.password?.[0];
      setError(pw || (err instanceof ApiError && err.status === 401 ? "This link has expired. Ask for a new one." : errorMessage(err)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl text-text">Choose a new password</h1>
        <p className="mt-1 text-sm text-text-muted">You’ll stay logged in here. Every other device is signed out.</p>
      </div>
      <Field label="New password" error={error} helper="At least 10 characters.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Save password
      </Button>
    </form>
  );
}
