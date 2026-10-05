import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Free resume check" };

export default function AtsChecker() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 md:px-6">
      <h1 className="text-2xl text-text">Free resume check</h1>
      <p className="text-base text-text-muted">
        Upload a resume and a job ad, get a report without making an account. This arrives with file import in a later release. For now, the
        same checks run live inside the builder.
      </p>
      <Button asChild className="self-start">
        <Link href="/signup">Try the builder</Link>
      </Button>
    </div>
  );
}
