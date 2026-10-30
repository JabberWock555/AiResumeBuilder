import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { repo } from "@/server/repo";
import { requireUserPage } from "@/server/session";
import { ResumeList } from "@/components/app/resume-list";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your resumes" };

export default async function Dashboard({ searchParams }: PageProps<"/app">) {
  const user = await requireUserPage();
  const sp = await searchParams;
  const sort = sp.sort === "updated" || sp.sort === "name" ? sp.sort : "created";
  const [resumes, usage, profile] = await Promise.all([repo.listResumes(user.id, sort), repo.usage(user.id), repo.getProfile(user.id)]);
  return (
    <div className="flex flex-col gap-6">
      {!profile.content && (
        <section aria-labelledby="profile-nudge" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center">
          <UserRound aria-hidden className="size-6 shrink-0 text-text-muted" />
          <div className="flex-1">
            <h2 id="profile-nudge" className="text-base font-semibold text-text">
              Enter your details once
            </h2>
            <p className="text-sm text-text-muted">Set up your profile by uploading your resume or filling it in. Every new resume then starts from it: you only add the job ad.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/app/profile">Set up your profile</Link>
          </Button>
        </section>
      )}
      <Suspense>
        <ResumeList
          resumes={resumes}
          sort={sort}
          firstName={user.fullName.split(" ")[0]}
          atLimit={usage.resume.max !== null && usage.resume.used >= usage.resume.max}
        />
      </Suspense>
    </div>
  );
}
