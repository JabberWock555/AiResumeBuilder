import { redirect } from "next/navigation";

const TABS = new Set(["contact", "experience", "education", "skills", "summary", "projects", "involvement", "certifications", "coursework", "finish"]);

// The editor itself is rendered by the layout. An unknown tab goes to Contact
// once (a fixed target, so it can never loop).
export default async function TabPage({ params }: PageProps<"/app/resume/[id]/[tab]">) {
  const { id, tab } = await params;
  if (!TABS.has(tab)) redirect(`/app/resume/${id}/contact`);
  return null;
}
