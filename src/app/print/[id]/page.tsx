import { notFound } from "next/navigation";
import { repo } from "@/server/repo";
import { readPrintToken } from "@/server/print-token";
import { ResumeDocument, PAGE } from "@/components/resume/resume-document";

export const metadata = { robots: { index: false } };

// Rendered only for headless Chromium during PDF export, authorised by a
// 60-second signed token instead of a session.
export default async function PrintPage({ params, searchParams }: PageProps<"/print/[id]">) {
  const { id } = await params;
  const t = (await searchParams).t;
  const tok = typeof t === "string" ? readPrintToken(t, id) : null;
  if (!tok) notFound();
  const resume = await repo.getResume(tok.userId, id);
  if (!resume || resume.revision !== tok.revision) notFound();
  const page = PAGE[resume.settings.pageSize];
  return (
    <div data-print-ready>
      <style>{`@page { size: ${page.width} ${page.height}; margin: 0 } html, body { background: var(--c-paper) !important; } nextjs-portal { display: none }`}</style>
      <ResumeDocument content={resume.content} settings={resume.settings} templateId={resume.templateId} print />
    </div>
  );
}
