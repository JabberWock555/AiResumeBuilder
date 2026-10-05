import Link from "next/link";
import { Check, Gauge, PenLine, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateGallery } from "@/components/app/template-gallery";

// Placeholder marketing copy. /replica-launch rewrites this page around the
// positioning chosen in /replica-entrepreneur.
const STEPS = [
  { icon: PenLine, title: "Write it", body: "Fill in one section at a time. Tips appear as you type, and AI drafts leave blanks for facts only you know." },
  { icon: Gauge, title: "Check it", body: "A score shows what to fix first, with a link straight to the line that needs it." },
  { icon: Target, title: "Tailor it", body: "Paste a job ad. See which of its keywords you’re missing and add the ones you’ve really done." },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto flex max-w-(--layout-content-max) flex-col items-start gap-6 px-4 py-16 md:px-6 md:py-24">
        <h1 className="max-w-3xl text-2xl text-text md:text-display">A resume that says what you actually did.</h1>
        <p className="max-w-2xl text-lg font-normal text-text-muted">
          Build it section by section, see what to fix, and tailor it to each job ad. Free to start, no card needed.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Build your resume</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/templates">See templates</Link>
          </Button>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
          {["Readable by applicant tracking systems", "PDF download", "No invented numbers from the AI"].map((x) => (
            <li key={x} className="flex items-center gap-2">
              <Check aria-hidden className="size-4 text-success" /> {x}
            </li>
          ))}
        </ul>
      </section>
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-(--layout-content-max) gap-8 px-4 py-16 md:grid-cols-3 md:px-6">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3">
              <Icon aria-hidden className="size-6 text-text" />
              <h2 className="text-lg text-text">{title}</h2>
              <p className="text-base text-text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-(--layout-content-max) px-4 py-16 md:px-6">
        <h2 className="mb-6 text-xl text-text">Templates</h2>
        <TemplateGallery />
      </section>
    </>
  );
}
