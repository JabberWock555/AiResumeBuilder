import { Fragment } from "react";
import { FONT_STACK } from "@/lib/resume/fonts";
import {
  SECTION_LABELS,
  formatRange,
  type EducationEntry,
  type ExperienceEntry,
  type ResumeContent,
  type ResumeSettings,
  type Section,
  type SimpleEntry,
  type SkillsEntry,
  type TemplateId,
} from "@/lib/resume/schema";
import { cn } from "@/lib/cn";

// The resume page. The same component renders the live preview, the template
// thumbnails and the page Chromium prints to PDF, so they always match.
// Plain semantic HTML in one column so applicant tracking systems can read it.

const ACCENT: Record<ResumeSettings["accent"], string> = {
  ink: "var(--c-resume-ink)",
  slate: "var(--c-resume-slate)",
  teal: "var(--c-resume-teal)",
  plum: "var(--c-resume-plum)",
};

export const PAGE = {
  letter: { width: "8.5in", height: "11in", px: [816, 1056] as const },
  a4: { width: "210mm", height: "297mm", px: [794, 1123] as const },
};

function Highlight({ text, terms }: { text: string; terms?: RegExp | null }) {
  if (!terms || !text) return <>{text}</>;
  const parts = text.split(terms);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-highlight text-ink">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function termsRegex(terms?: string[]) {
  const t = (terms ?? []).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!t.length) return null;
  const esc = t.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(\\b(?:${esc.join("|")})\\b)`, "gi");
}

type Props = {
  content: ResumeContent;
  settings: ResumeSettings;
  templateId: TemplateId;
  /** Keyword terms to highlight (preview only, never in the PDF). */
  highlight?: string[];
  /** Print mode: no page shadow, sized for @page. */
  print?: boolean;
  className?: string;
};

export function ResumeDocument({ content, settings, templateId, highlight, print, className }: Props) {
  const re = termsRegex(highlight);
  const H = (t: string) => <Highlight text={t} terms={re} />;
  const accent = ACCENT[settings.accent];
  const gap = `${4 + settings.sectionSpacing * 3}pt`;
  const c = content.contact;
  const place = [c.city, c.showState && c.state, c.showCountry && c.country].filter(Boolean).join(", ");
  const contactBits = [c.email, c.phone, c.linkedin && `linkedin.com/in/${c.linkedin}`, c.website, place].filter(Boolean) as string[];
  const page = PAGE[settings.pageSize];
  const centred = templateId === "standard";

  const heading = (title: string) => (
    <h2
      className={cn(
        "font-bold tracking-wide",
        templateId === "modern" ? "text-[1.05em]" : "text-[0.95em] uppercase",
        settings.divider && templateId !== "modern" && "border-b border-paper-rule pb-[1pt]",
      )}
      style={{ color: templateId === "modern" ? accent : undefined, marginBottom: "3pt" }}
    >
      {templateId === "modern" && <span aria-hidden className="mr-[5pt] inline-block h-[0.7em] w-[3pt] align-baseline" style={{ background: accent }} />}
      {title}
    </h2>
  );

  const sections = content.sections.filter((s) => !s.hidden && hasContent(s));

  return (
    <article
      lang="en"
      className={cn("bg-paper text-ink", !print && "shadow-card", className)}
      style={{
        width: page.width,
        minHeight: page.height,
        padding: templateId === "compact" ? "0.45in 0.5in" : "0.55in 0.65in",
        fontFamily: FONT_STACK[settings.font],
        fontSize: `${settings.fontSize}pt`,
        lineHeight: templateId === "compact" ? 1.3 : 1.4,
      }}
    >
      <header className={cn(centred ? "text-center" : "text-left")} style={{ marginBottom: gap }}>
        <h1
          className={cn("font-bold leading-tight", templateId === "modern" ? "text-[2.1em]" : "text-[1.8em]")}
          style={{ color: templateId === "modern" ? accent : undefined }}
        >
          {c.fullName || "Your name"}
        </h1>
        {contactBits.length > 0 && (
          <p className="mt-[2pt] text-[0.92em] text-ink-muted">
            {contactBits.map((b, i) => (
              <Fragment key={b}>
                {i > 0 && <span aria-hidden> · </span>}
                {b}
              </Fragment>
            ))}
          </p>
        )}
      </header>

      {content.summary.text.trim() && (
        <section style={{ marginBottom: gap }}>
          {heading("Summary")}
          <p>{H(content.summary.text)}</p>
        </section>
      )}

      {sections.map((s) => (
        <section key={s.id} style={{ marginBottom: gap }}>
          {heading(s.title || SECTION_LABELS[s.type])}
          {s.type === "skills" ? (
            <ul className="flex flex-col gap-[1pt]">
              {(s.entries as SkillsEntry[])
                .filter((e) => e.items.length || e.category)
                .map((e) => (
                  <li key={e.id}>
                    {e.category && <b>{e.category}: </b>}
                    {H(e.items.join(", "))}
                  </li>
                ))}
            </ul>
          ) : s.type === "education" ? (
            (s.entries as EducationEntry[])
              .filter((e) => e.degree || e.institution)
              .map((e) => (
                <div key={e.id} className="break-inside-avoid" style={{ marginBottom: "4pt" }}>
                  <div className="flex justify-between gap-[8pt]">
                    <b>{H(e.degree)}</b>
                    <span className="shrink-0">{e.year ?? ""}</span>
                  </div>
                  <div className="flex justify-between gap-[8pt] text-ink-muted">
                    <span>
                      {e.institution}
                      {e.minor && ` · Minor in ${e.minor}`}
                      {e.gpa && ` · GPA ${e.gpa}`}
                    </span>
                    <span className="shrink-0">{e.location}</span>
                  </div>
                  {e.extra && <p>{H(e.extra)}</p>}
                </div>
              ))
          ) : s.type === "certifications" || s.type === "coursework" ? (
            <ul>
              {(s.entries as SimpleEntry[])
                .filter((e) => e.name)
                .map((e) => (
                  <li key={e.id} className="flex justify-between gap-[8pt]">
                    <span>
                      <b>{H(e.name)}</b>
                      {e.issuer && <span className="text-ink-muted"> · {e.issuer}</span>}
                      {e.detail && <span> · {H(e.detail)}</span>}
                    </span>
                    <span className="shrink-0">{e.year ?? ""}</span>
                  </li>
                ))}
            </ul>
          ) : (
            (s.entries as ExperienceEntry[])
              .filter((e) => e.role || e.company || e.bullets.some((b) => b.text.trim()))
              .map((e) => (
                <div key={e.id} className="break-inside-avoid" style={{ marginBottom: "5pt" }}>
                  {templateId === "compact" ? (
                    <div className="flex justify-between gap-[8pt]">
                      <span>
                        <b>{H(e.role)}</b>
                        {e.company && <> · {e.company}</>}
                        {e.location && <span className="text-ink-muted"> · {e.location}</span>}
                      </span>
                      <span className="shrink-0">{formatRange(e.start, e.end)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between gap-[8pt]">
                        <b>{H(e.role)}</b>
                        <span className="shrink-0">{formatRange(e.start, e.end)}</span>
                      </div>
                      <div className="flex justify-between gap-[8pt] text-ink-muted">
                        <span>{e.company}</span>
                        <span className="shrink-0">{e.location}</span>
                      </div>
                    </>
                  )}
                  <ul className="mt-[1pt] list-disc pl-[12pt]">
                    {e.bullets
                      .filter((b) => b.text.trim())
                      .map((b) => (
                        <li key={b.id}>{H(b.text)}</li>
                      ))}
                  </ul>
                </div>
              ))
          )}
        </section>
      ))}
    </article>
  );
}

function hasContent(s: Section) {
  return (s.entries as Array<Record<string, unknown>>).some((e) =>
    Object.entries(e).some(([k, v]) =>
      k === "id" ? false : typeof v === "string" ? v.trim() : Array.isArray(v) ? v.some((x) => (typeof x === "string" ? x : (x as { text: string }).text)?.trim()) : v !== null,
    ),
  );
}
