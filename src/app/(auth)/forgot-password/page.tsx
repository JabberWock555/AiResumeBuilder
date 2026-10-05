import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotForm } from "@/components/app/auth-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function Page() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
