import { Suspense } from "react";
import type { Metadata } from "next";
import { SignupForm } from "@/components/app/auth-forms";

export const metadata: Metadata = { title: "Create your account" };

export default function Page() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
