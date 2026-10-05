import { redirect } from "next/navigation";

export default async function ResumeIndex({ params }: PageProps<"/app/resume/[id]">) {
  redirect(`/app/resume/${(await params).id}/contact`);
}
