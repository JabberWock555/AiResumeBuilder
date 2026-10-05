import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/app/auth-forms";

export const metadata: Metadata = { title: "Log in" };

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
