// Turns the plain text of a resume (from a PDF or Word file) into a resume
// document. Rule-based, so it works without an AI key: contact details by
// pattern, sections by their headings, roles by their date lines, bullets by
// their markers. It aims to get most things into the right box; the user then
// checks it in the profile editor. With an AI key, the server asks the model
// first and falls back to this.

import {
  blankContent,
  newId,
  resumeContent,
  type ExperienceEntry,
  type ResumeContent,
  type Section,
  type SectionType,
  type YearMonth,
} from "@/lib/resume/schema";

type Kind = SectionType | "summary" | "contact";

const HEADINGS: [Kind, RegExp][] = [
  ["summary", /^(professional |career |personal )?(summary|profile|about( me)?|objective|overview)$/],
  ["experience", /^((work|professional|relevant|employment) )?(experience|history)$|^employment( history)?$|^work history$|^career history$/],
  ["education", /^(education|academic background|academics|education and training)$/],
  ["skills", /^((technical|core|key) )?(skills|competencies|expertise)( (and|&) (tools|technologies|interests))?$|^(tools|technologies|tech stack)$/],
  ["projects", /^((selected|personal|key) )?projects$/],
  ["certifications", /^(certifications?|licen[cs]es( (and|&) certifications)?|certificates?)$/],
  ["involvement", /^(volunteer(ing)?( experience)?|leadership( experience)?|involvement|activities|extracurricular activities)$/],
  ["coursework", /^(relevant )?coursework$/],
];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE = `(?:${MONTH}\\.?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(present|current|now|today|${DATE})`, "i");
const SINGLE_YEAR = /\b(19[5-9]\d|20\d\d)\b/;
const BULLET = /^\s*(?:[•●▪◦‣∙·*–-]|\d+[.)])\s+/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\(?\d[\d\s().-]{7,}\d)/;
const LINKEDIN = /linkedin\.com\/in\/([A-Za-z0-9_-]+)/i;
const URL = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s|,]*)?)/i;
const LOCATION = /\b([A-Z][a-zA-Z.' -]+),\s*([A-Z]{2}|[A-Z][a-zA-Z ]+)\b/;
/** A whole line that's a place: "Bengaluru, KA", "Austin, Texas", "London, United Kingdom". */
const LOCATION_LINE = /^[\p{Lu}][\p{L}.' -]{1,30},\s*(?:[A-Z]{2}|[\p{Lu}][\p{L}]+(?: [\p{Lu}][\p{L}]+){0,2})$/u;
const DEGREE = /\b(b\.?s\.?c?|b\.?a\.?|b\.?e\.?|b\.?tech|bachelor|m\.?s\.?c?|m\.?a\.?|m\.?tech|mba|master|ph\.?d|doctor|associate|diploma|certificate|high school|a-levels?|b\.?com|m\.?com|bfa|mfa)\b/i;
const SCHOOL = /\b(university|college|institute|school|academy|polytechnic|iit|nit)\b/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cut = (s: string, n: number) => clean(s).slice(0, n);

function headingOf(line: string): Kind | null {
  const t = clean(line).replace(/[:.]$/, "").toLowerCase();
  if (!t || t.length > 40 || t.split(" ").length > 5) return null;
  for (const [kind, re] of HEADINGS) if (re.test(t)) return kind;
  return null;
}

function toYearMonth(s: string): YearMonth | null {
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return { year: Number(m[2]), month: Math.min(12, Math.max(1, Number(m[1]))) };
  m = t.match(new RegExp(`^(${MONTH})\\.?\\s+(\\d{4})$`, "i"));
  if (m) return { year: Number(m[2]), month: MONTHS[m[1].slice(0, m[1].startsWith("sept") ? 4 : 3)] ?? 1 };
  m = t.match(/^(\d{4})$/);
  if (m) return { year: Number(m[1]), month: 1 };
  return null;
}

/** Contact details from the top of the resume (and anywhere for email/phone). */
function parseContact(lines: string[], all: string) {
  const c = blankContent().contact;
  c.email = all.match(EMAIL)?.[0] ?? "";
  const phone = all.replace(EMAIL, " ").match(PHONE)?.[0];
  if (phone && phone.replace(/\D/g, "").length >= 8 && phone.replace(/\D/g, "").length <= 15) c.phone = clean(phone);
  c.linkedin = all.match(LINKEDIN)?.[1] ?? "";
  for (const l of lines.slice(0, 8)) {
    for (const part of l.split(/\s*[|•·]\s*/)) {
      if (!c.website && !EMAIL.test(part) && !LINKEDIN.test(part)) {
        const u = part.match(URL)?.[1];
        if (u && /[a-z]/i.test(u) && !/^\d/.test(u) && u.includes(".") && !/\.(com|net|org)\b.*@/.test(u)) c.website = u.replace(/^https?:\/\//, "").replace(/\/$/, "");
      }
      const loc = part.match(LOCATION);
      if (!c.city && loc && !EMAIL.test(part) && part.length < 50) {
        c.city = clean(loc[1]);
        c.state = clean(loc[2]);
      }
    }
  }
  // The name: the first short line that's only words.
  const name = lines.slice(0, 5).find((l) => {
    const t = clean(l);
    return t.length >= 3 && t.length <= 50 && /^[\p{L}][\p{L}.' -]+$/u.test(t) && t.split(" ").length <= 5 && !headingOf(t);
  });
  c.fullName = name ? cut(name, 120) : "";
  return c;
}

/** Splits "Role at Company", "Role | Company", "Role, Company" or "Company — Role". */
function splitRole(header: string): { role: string; company: string } {
  const at = header.match(/^(.*?)\s+at\s+(.*)$/i);
  if (at) return { role: at[1], company: at[2] };
  const parts = header.split(/\s+[|—–]\s+|\s+-\s+|,\s+/).map(clean).filter(Boolean);
  if (parts.length >= 2) return { role: parts[0], company: parts[1] };
  return { role: header, company: "" };
}

/** A short title-like line (a role or company), not a sentence. */
const isShort = (l: string) => l.split(" ").length <= 10 && !/[.!?]$/.test(l) && l.length <= 90;

function parseExperience(raw: string[]): ExperienceEntry[] {
  // PDF and Word text usually loses bullet markers, so a role is found by its
  // layout: one or two short lines next to a date range. Sentences after the
  // dates are its bullets.
  const lines = raw.map((l) => ({ text: clean(l), bullet: BULLET.test(l) })).filter((l) => l.text);
  const entries: (ExperienceEntry & { header: string[] })[] = [];
  let cur: (ExperienceEntry & { header: string[] }) | null = null;
  const start = () => {
    if (cur) finish(cur);
    cur = { id: newId("e"), role: "", company: "", location: "", start: null, end: null, bullets: [], header: [] };
    entries.push(cur);
    return cur;
  };
  const finish = (e: ExperienceEntry & { header: string[] }) => {
    const texts = e.header;
    if (texts.length) {
      if (texts.length >= 2 && !/\s(at|\|)\s|,/.test(texts[0])) {
        e.role = texts[0];
        e.company = texts[1];
      } else {
        Object.assign(e, splitRole(texts[0]));
        if (!e.company && texts[1] && !LOCATION.test(texts[1])) e.company = texts[1];
      }
      // A location is its own line (or an extra "| City, ST" part), never the role line itself.
      const candidates = [...texts.slice(1), ...texts[0].split(/\s+\|\s+/).slice(2)];
      const loc = candidates.find((t) => LOCATION_LINE.test(t) || /^remote$/i.test(t));
      if (loc) {
        e.location = clean(loc);
        if (e.company === loc) e.company = "";
      }
      e.company = e.company.replace(/[\s,|–—-]+$/, "").trim();
      e.role = cut(e.role, 120);
      e.company = cut(e.company, 120);
      e.location = cut(e.location, 120);
    }
    e.header = [];
  };
  const hasRange = (i: number) => i < lines.length && RANGE.test(lines[i].text);

  for (let i = 0; i < lines.length; i++) {
    const { text: line, bullet } = lines[i];
    const range = line.match(RANGE);
    const e0 = cur as (ExperienceEntry & { header: string[] }) | null;
    if (range) {
      // A second date range means the next role.
      const e = !e0 || e0.start || e0.bullets.length ? (e0 && !e0.start && !e0.bullets.length ? e0 : start()) : e0;
      e.start = toYearMonth(range[1]);
      e.end = /present|current|now|today/i.test(range[2]) ? "present" : toYearMonth(range[2]);
      const rest = clean(line.replace(range[0], "").replace(/[\s|,–—-]+$/, "").replace(/^[\s|,–—-]+/, ""));
      if (rest) e.header.push(rest);
      continue;
    }
    // A short line just before a date line (or one line before it) starts a role.
    const opensRole =
      !bullet && isShort(line) && (hasRange(i + 1) || (i + 2 < lines.length && isShort(lines[i + 1].text) && !lines[i + 1].bullet && hasRange(i + 2)));
    if (opensRole && (!e0 || e0.start || e0.bullets.length || e0.header.length >= 2)) {
      start().header.push(line);
      continue;
    }
    const e = e0 ?? start();
    if (!bullet && !e.start && !e.bullets.length && e.header.length < 2 && isShort(line)) e.header.push(line);
    else if (e.bullets.length < 20) e.bullets.push({ id: newId("b"), text: cut(line.replace(BULLET, ""), 600) });
  }
  if (cur) finish(cur);
  return entries
    .map(({ header: _h, ...e }) => (void _h, e))
    .filter((e) => e.role || e.company || e.bullets.length)
    .slice(0, 30);
}

function parseEducation(lines: string[]) {
  const entries: Extract<Section, { type: "education" }>["entries"] = [];
  let cur: (typeof entries)[number] | null = null;
  for (const raw of lines) {
    const line = clean(raw.replace(BULLET, ""));
    if (!line) continue;
    const school = SCHOOL.test(line);
    const degree = DEGREE.test(line);
    if (!cur || (school && cur.institution) || (degree && cur.degree && !school)) {
      cur = { id: newId("e"), degree: "", institution: "", location: "", year: null, minor: "", gpa: "", extra: "" };
      entries.push(cur);
    }
    const years = [...line.matchAll(new RegExp(SINGLE_YEAR, "g"))].map((m) => Number(m[1]));
    if (years.length) cur.year = Math.max(...years);
    const gpa = line.match(/\b(?:gpa|cgpa)[:\s]*([\d.]+(?:\s*\/\s*[\d.]+)?)/i);
    if (gpa) cur.gpa = cut(gpa[1], 20);
    const stripped = clean(line.replace(RANGE, "").replace(SINGLE_YEAR, "").replace(/\b(?:gpa|cgpa)[:\s]*[\d.]+(?:\s*\/\s*[\d.]+)?/i, "").replace(/[|,–—-]\s*$/, ""));
    if (school && !cur.institution) {
      const parts = stripped.split(/\s+[|—–]\s+|,\s+(?=[A-Z])/);
      const inst = parts.find((p) => SCHOOL.test(p)) ?? stripped;
      cur.institution = cut(inst, 160);
      // Other parts of the line: a degree, or else the place ("…, Trichy").
      for (const other of parts.filter((p) => p !== inst)) {
        if (DEGREE.test(other) && !cur.degree) cur.degree = cut(other, 160);
        else if (!cur.location && !SCHOOL.test(other)) cur.location = cut(other, 120);
      }
    } else if (degree && !cur.degree) {
      cur.degree = cut(stripped, 160);
    } else if (stripped && !cur.extra) {
      cur.extra = cut(stripped, 600);
    }
  }
  return entries.filter((e) => e.degree || e.institution).slice(0, 10);
}

function parseSkills(lines: string[]) {
  const entries: Extract<Section, { type: "skills" }>["entries"] = [];
  const loose: string[] = [];
  for (const raw of lines) {
    const line = clean(raw.replace(BULLET, ""));
    if (!line) continue;
    const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
    const items = (m ? m[2] : line).split(/\s*[,;|•·]\s*/).map((s) => cut(s, 60)).filter((s) => /[\p{L}\p{N}]/u.test(s));
    if (m) entries.push({ id: newId("e"), category: cut(m[1], 60), items: items.slice(0, 40) });
    else loose.push(...items);
  }
  if (loose.length) entries.push({ id: newId("e"), category: entries.length ? "Other" : "Skills", items: [...new Set(loose)].slice(0, 40) });
  return entries.slice(0, 12);
}

function parseSimple(lines: string[]) {
  return lines
    .map((l) => clean(l.replace(BULLET, "")))
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const year = line.match(SINGLE_YEAR);
      const rest = clean(line.replace(RANGE, "").replace(SINGLE_YEAR, "").replace(/\(\s*\)/g, "").replace(/[\s|,–—(-]+$/, ""));
      const [name, issuer] = rest.split(/\s+[|—–]\s+|\s+-\s+|,\s+/);
      return { id: newId("e"), name: cut(name ?? rest, 160), issuer: cut(issuer ?? "", 160), year: year ? Number(year[1]) : null, detail: "" };
    });
}

export function textToResume(text: string): ResumeContent {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/ /g, " ").trimEnd());
  const all = lines.join("\n");

  // Group lines under the heading they follow; everything before the first heading is the header.
  const groups: { kind: Kind; lines: string[] }[] = [{ kind: "contact", lines: [] }];
  for (const l of lines) {
    const h = headingOf(l);
    if (h) groups.push({ kind: h, lines: [] });
    else groups.at(-1)!.lines.push(l);
  }
  const linesOf = (k: Kind) => groups.filter((g) => g.kind === k).flatMap((g) => g.lines);

  const content = blankContent();
  content.contact = parseContact(groups[0].lines.filter((l) => clean(l)), all);
  content.summary = { text: cut(linesOf("summary").map(clean).filter(Boolean).join(" "), 1200) };

  const sections: Section[] = [];
  const add = (type: SectionType, entries: unknown[]) => {
    if (entries.length) sections.push({ id: newId("s"), type, hidden: false, entries } as Section);
  };
  add("experience", parseExperience(linesOf("experience")));
  add("education", parseEducation(linesOf("education")));
  add("skills", parseSkills(linesOf("skills")));
  add("projects", parseExperience(linesOf("projects")));
  add("involvement", parseExperience(linesOf("involvement")));
  add("certifications", parseSimple(linesOf("certifications")));
  add("coursework", parseSimple(linesOf("coursework")));
  // Always have the three main sections, even if empty, so the editor shows them.
  for (const t of ["experience", "education", "skills"] as const) {
    if (!sections.some((s) => s.type === t)) sections.push(blankContent().sections.find((s) => s.type === t)!);
  }
  const order: SectionType[] = ["experience", "projects", "involvement", "education", "skills", "certifications", "coursework"];
  content.sections = sections.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).slice(0, 12);

  const parsed = resumeContent.safeParse(content);
  return parsed.success ? parsed.data : blankContent();
}

/** How much the parser found, to tell the user what to check. */
export function importSummary(c: ResumeContent) {
  const entries = (t: SectionType) => c.sections.find((s) => s.type === t)?.entries ?? [];
  const filled = (e: Record<string, unknown>) =>
    Object.entries(e).some(([k, v]) =>
      k === "id" ? false : typeof v === "string" ? v.trim() !== "" : Array.isArray(v) ? v.some((x) => (typeof x === "string" ? x.trim() : (x as { text?: string })?.text?.trim())) : v !== null && typeof v !== "boolean",
    );
  return {
    name: Boolean(c.contact.fullName),
    email: Boolean(c.contact.email),
    roles: entries("experience").filter((e) => filled(e as Record<string, unknown>)).length,
    education: entries("education").filter((e) => filled(e as Record<string, unknown>)).length,
    skills: entries("skills").reduce((n, e) => n + ("items" in e ? e.items.length : 0), 0),
    summary: Boolean(c.summary.text),
  };
}
