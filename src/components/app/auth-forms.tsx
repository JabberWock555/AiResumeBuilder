"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api, errorMessage } from "@/lib/api";

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

export function SignupForm() {
  const router = useRouter();
  const [fullName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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
      await api("/api/auth/signup", { body: { fullName, email, password } });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setErrors({
        form:
          err instanceof ApiError && err.code === "email_taken"
            ? "There’s already an account with that email. Log in instead."
            : errorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl text-text">Create your account</h1>
        <p className="mt-1 text-sm text-text-muted">Free to start. No card needed.</p>
      </div>
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
      <p className="text-center text-xs text-text-muted">Google and Apple sign-in arrive with real accounts.</p>
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/auth/login", { body: { email, password } });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "bad_credentials" ? "That email and password don’t match an account." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl text-text">Welcome back</h1>
        <p className="mt-1 text-sm text-text-muted">Log in to keep working on your resumes.</p>
      </div>
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
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/forgot", { body: { email } });
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

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    setBusy(true);
    try {
      await api("/api/auth/reset", { body: { token, password } });
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid_token" ? "This link has expired. Ask for a new one." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <h1 className="text-xl text-text">Choose a new password</h1>
      <Field label="New password" error={error} helper="At least 10 characters.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Save password
      </Button>
    </form>
  );
}
