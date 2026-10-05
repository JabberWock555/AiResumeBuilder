import type { Metadata } from "next";
import { repo } from "@/server/repo";
import { requireUserPage } from "@/server/session";
import { ResumeList } from "@/components/app/resume-list";

export const metadata: Metadata = { title: "Your resumes" };

export default async function Dashboard({ searchParams }: PageProps<"/app">) {
  const user = await requireUserPage();
  const sp = await searchParams;
  const sort = sp.sort === "updated" || sp.sort === "name" ? sp.sort : "created";
  const [resumes, usage] = await Promise.all([repo.listResumes(user.id, sort), repo.usage(user.id)]);
  return (
    <ResumeList
      resumes={resumes}
      sort={sort}
      firstName={user.fullName.split(" ")[0]}
      atLimit={usage.resume.max !== null && usage.resume.used >= usage.resume.max}
    />
  );
}
