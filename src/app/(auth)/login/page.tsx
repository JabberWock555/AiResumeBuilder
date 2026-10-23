import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/app/auth-forms";
import { config } from "@/server/config";

export const metadata: Metadata = { title: "Log in" };

export default function Page() {
  return (
    <Suspense>
      <LoginForm providers={config.oauth} />
    </Suspense>
  );
}
