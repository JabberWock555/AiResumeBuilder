import { notFound } from "next/navigation";
import { repo } from "@/server/repo";
import { requireUserPage } from "@/server/session";
import { Editor } from "@/components/editor/editor";

export async function generateMetadata({ params }: LayoutProps<"/app/resume/[id]">) {
  const user = await requireUserPage();
  const r = await repo.getResume(user.id, (await params).id);
  return { title: r ? `${r.name} · Editor` : "Resume not found" };
}

// The editor lives in the layout so moving between section tabs keeps its
// state (and any unsaved edits); each tab's page only validates the URL.
export default async function EditorLayout({ params, children }: LayoutProps<"/app/resume/[id]">) {
  const user = await requireUserPage();
  const { id } = await params;
  const [resume, target, usage, all] = await Promise.all([
    repo.getResume(user.id, id),
    repo.getTarget(user.id, id),
    repo.usage(user.id),
    repo.listResumes(user.id, "updated"),
  ]);
  if (!resume) notFound();
  return (
    <>
      <Editor key={resume.id} resume={resume} initialTarget={target} usage={usage} others={all.map((r) => ({ id: r.id, name: r.name }))} />
      {children}
    </>
  );
}
