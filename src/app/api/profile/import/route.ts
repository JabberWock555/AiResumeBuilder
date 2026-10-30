import { repo } from "@/server/repo";
import { InputError } from "@/server/errors";
import { assertSameOrigin, handle } from "@/server/http";
import { limit, perKey } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { ImportError, MAX_BYTES, fileToText, resumeFromText, sniff } from "@/server/import";
import { importSummary } from "@/lib/import/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Upload a resume (PDF or Word, up to 5 MB) and turn it into profile details.
 * The file is read in memory and never stored. Returns the parsed document for
 * the user to check; nothing is saved until the profile editor saves it.
 * Uses one import from the plan (Free: 3), given back if reading fails.
 */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await limit(perKey("import", user.id, 10, 3600));

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new InputError({ fieldErrors: { file: ["Choose a PDF or Word file."] } });
  if (file.size === 0 || file.size > MAX_BYTES) return Response.json({ error: "too_big" }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return Response.json({ error: "wrong_type" }, { status: 415 });

  await repo.consumeQuota(user.id, "import");
  try {
    const text = await fileToText(buf, kind).catch((e) => {
      if (e instanceof ImportError) throw e;
      throw new ImportError("unreadable");
    });
    const r = await resumeFromText(text);
    if (r.via !== "rules")
      await repo.logAi(user.id, { resumeId: null, kind: "import_parse", model: r.via, counted: false, status: "ok", inputTokens: r.inputTokens, outputTokens: r.outputTokens });
    return Response.json({ content: r.content, found: importSummary(r.content), via: r.via === "rules" ? "rules" : "ai" });
  } catch (e) {
    await repo.refundQuota(user.id, "import");
    if (e instanceof ImportError) return Response.json({ error: e.code }, { status: 422 });
    throw e;
  }
});
