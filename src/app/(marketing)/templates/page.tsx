import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TemplateGallery } from "@/components/app/template-gallery";

export const metadata: Metadata = { title: "Resume templates" };

export default function Templates() {
  return (
    <div className="mx-auto flex max-w-(--layout-content-max) flex-col gap-8 px-4 py-12 md:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl text-text">Resume templates</h1>
        <p className="max-w-2xl text-base text-text-muted">
          One column, real text, standard headings: layouts that applicant tracking systems read cleanly. Switch any time; your content stays.
        </p>
      </div>
      <TemplateGallery />
      <Button asChild size="lg" className="self-start">
        <Link href="/signup">Use a template</Link>
      </Button>
    </div>
  );
}
