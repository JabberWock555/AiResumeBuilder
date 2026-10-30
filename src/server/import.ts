import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { config } from "./config";
import { textToResume } from "@/lib/import/parse";
import { blankContent, newId, resumeContent, type ResumeContent } from "@/lib/resume/schema";

// Reading an uploaded resume (PDF or Word) into a resume document. The file is
// read in memory and never stored; only the resulting text fields are kept,
// once the user saves them to their profile.

export const MAX_BYTES = 5 * 1024 * 1024;
export type FileKind = "pdf" | "docx";

/** The real type, from the file's first bytes (not its name or what the browser says). */
export function sniff(buf: Uint8Array): FileKind | null {
  const head = Buffer.from(buf.subarray(0, 8)).toString("latin1");
  if (head.startsWith("%PDF-")) return "pdf";
  // DOCX is a zip that contains word/document.xml.
  if (head.startsWith("PK\u0003\u0004") && Buffer.from(buf).includes("word/document.xml")) return "docx";
  return null;
}

export async function fileToText(buf: Uint8Array, kind: FileKind) {
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    if (pdf.numPages > 10) throw new ImportError("too_long");
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text);
  }
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return value;
}

export class ImportError extends Error {
  constructor(public code: "no_text" | "too_long" | "unreadable") {
    super(code);
  }
}

// The model fills this shape (no ids; we add them). Kept close to the editor's
// fields so nothing gets lost on the way.
const ym = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).nullable();
const aiShape = z.object({
  contact: z.object({
    fullName: z.string(), email: z.string(), phone: z.string(), linkedin: z.string().describe("only the handle after linkedin.com/in/"),
    website: z.string(), city: z.string(), state: z.string(), country: z.string(),
  }),
  summary: z.string(),
  experience: z.array(z.object({ role: z.string(), company: z.string(), location: z.string(), start: ym, end: ym, current: z.boolean(), bullets: z.array(z.string()) })),
  projects: z.array(z.object({ role: z.string().describe("project name"), company: z.string(), start: ym, end: ym, bullets: z.array(z.string()) })),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), location: z.string(), year: z.number().int().nullable(), gpa: z.string(), extra: z.string() })),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string(), year: z.number().int().nullable() })),
});

function fromAi(a: z.infer<typeof aiShape>): ResumeContent {
  const c = blankContent();
  const t = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
  c.contact = {
    ...c.contact,
    fullName: t(a.contact.fullName, 120), email: t(a.contact.email, 160), phone: t(a.contact.phone, 40),
    linkedin: t(a.contact.linkedin.replace(/^.*linkedin\.com\/in\//i, "").replace(/\/$/, ""), 100), website: t(a.contact.website, 200),
    city: t(a.contact.city, 80), state: t(a.contact.state, 80), country: t(a.contact.country, 80),
  };
  c.summary = { text: t(a.summary, 1200) };
  const exp = (list: { role: string; company: string; location?: string; start: z.infer<typeof ym>; end: z.infer<typeof ym>; current?: boolean; bullets: string[] }[]) =>
    list.slice(0, 30).map((e) => ({
      id: newId("e"), role: t(e.role, 120), company: t(e.company, 120), location: t(e.location ?? "", 120),
      start: e.start, end: e.current ? ("present" as const) : e.end,
      bullets: e.bullets.slice(0, 20).map((b) => ({ id: newId("b"), text: t(b, 600) })),
    }));
  const sections: ResumeContent["sections"] = [
    { id: newId("s"), type: "experience", hidden: false, entries: exp(a.experience) },
    ...(a.projects.length ? [{ id: newId("s"), type: "projects" as const, hidden: false, entries: exp(a.projects) }] : []),
    {
      id: newId("s"), type: "education", hidden: false,
      entries: a.education.slice(0, 10).map((e) => ({ id: newId("e"), degree: t(e.degree, 160), institution: t(e.institution, 160), location: t(e.location, 120), year: e.year, minor: "", gpa: t(e.gpa, 20), extra: t(e.extra, 600) })),
    },
    { id: newId("s"), type: "skills", hidden: false, entries: a.skills.slice(0, 12).map((s) => ({ id: newId("e"), category: t(s.category, 60), items: s.items.slice(0, 40).map((i) => t(i, 60)) })) },
    ...(a.certifications.length
      ? [{ id: newId("s"), type: "certifications" as const, hidden: false, entries: a.certifications.slice(0, 20).map((x) => ({ id: newId("e"), name: t(x.name, 160), issuer: t(x.issuer, 160), year: x.year, detail: "" })) }]
      : []),
  ];
  c.sections = sections;
  const ok = resumeContent.safeParse(c);
  if (!ok.success) throw new Error("ai import didn't validate");
  return ok.data;
}

/**
 * Text → resume document. The model (if there's an AI key) maps the text into
 * fields without rewording anything; the rule-based parser is the fallback.
 */
export async function resumeFromText(text: string): Promise<{ content: ResumeContent; via: string; inputTokens?: number; outputTokens?: number }> {
  if (text.replace(/\s/g, "").length < 200) throw new ImportError("no_text");
  if (config.ai) {
    try {
      const r = await generateText({
        model: config.models.strong,
        system:
          "You copy a resume's text into fields. Copy wording exactly; never add, improve or invent anything. Dates as year and month (month 1 if only a year is given). Leave a field empty if the resume doesn't say it.",
        prompt: text.slice(0, 30000),
        output: Output.object({ schema: aiShape }),
        temperature: 0,
        maxRetries: 1,
        timeout: 45_000,
      });
      return { content: fromAi(r.output), via: config.models.strong, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
    } catch (e) {
      console.error(`AI import fell back to rules: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { content: textToResume(text), via: "rules" };
}
