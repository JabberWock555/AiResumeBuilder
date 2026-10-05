import { z } from "zod";
import { repo } from "@/server/repo";
import { ConflictError, NotFoundError } from "@/server/errors";
import { assertSameOrigin, body, handle } from "@/server/http";
import { requireUser } from "@/server/session";
import { makePrintToken } from "@/server/print-token";
import { renderPdf } from "@/server/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const input = z.object({ resumeId: z.string(), format: z.enum(["pdf"]), revision: z.number().int() });

function fileName(name: string) {
  return `${name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "Resume"}.pdf`;
}

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const i = await body(req, input);
  const resume = await repo.getResume(user.id, i.resumeId);
  if (!resume) throw new NotFoundError("resume_not_found");
  // Export exactly what the user is looking at: the client must be up to date.
  if (resume.revision !== i.revision) throw new ConflictError({ revision: resume.revision });

  // Downloading the same unchanged resume again is free.
  const repeat = await repo.wasExported(user.id, resume.id, "pdf", resume.revision);
  const left = repeat ? undefined : await repo.consumeQuota(user.id, "pdf_download");
  try {
    const url = `${new URL(req.url).origin}/print/${resume.id}?t=${makePrintToken(user.id, resume.id, resume.revision)}`;
    const pdf = await renderPdf(url, resume.settings.pageSize);
    await repo.recordExport(user.id, resume.id, "pdf", resume.revision, resume.templateId);
    return new Response(pdf as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName(resume.name))}`,
        "x-downloads-left": left === undefined ? "unchanged" : String(left ?? "unlimited"),
      },
    });
  } catch (e) {
    if (!repeat) await repo.refundQuota(user.id, "pdf_download");
    throw e;
  }
});
