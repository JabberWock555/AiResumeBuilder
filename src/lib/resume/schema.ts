import { z } from "zod";

/* The resume document. One per resume, stored as jsonb (see replica/architecture.md). */

export const yearMonth = z.object({
  year: z.number().int().min(1950).max(2100),
  month: z.number().int().min(1).max(12),
});
export type YearMonth = z.infer<typeof yearMonth>;

const text = (max: number) => z.string().max(max);

export const bullet = z.object({ id: z.string(), text: text(600) });

export const experienceEntry = z.object({
  id: z.string(),
  role: text(120),
  company: text(120),
  location: text(120),
  start: yearMonth.nullable(),
  end: z.union([yearMonth, z.literal("present")]).nullable(),
  bullets: z.array(bullet).max(20),
});

export const educationEntry = z.object({
  id: z.string(),
  degree: text(160),
  institution: text(160),
  location: text(120),
  year: z.number().int().min(1950).max(2100).nullable(),
  minor: text(120),
  gpa: text(20),
  extra: text(600),
});

export const skillsEntry = z.object({
  id: z.string(),
  category: text(60),
  items: z.array(text(60)).max(40),
});

/** Certifications and coursework: a name, who issued it, when. */
export const simpleEntry = z.object({
  id: z.string(),
  name: text(160),
  issuer: text(160),
  year: z.number().int().min(1950).max(2100).nullable(),
  detail: text(600),
});

export const EXPERIENCE_LIKE = ["experience", "projects", "involvement"] as const;
export const SIMPLE_LIKE = ["certifications", "coursework"] as const;
export const SECTION_TYPES = ["experience", "education", "skills", ...EXPERIENCE_LIKE.slice(1), ...SIMPLE_LIKE] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

const base = { id: z.string(), title: text(40).optional(), hidden: z.boolean() };
export const section = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("experience"), entries: z.array(experienceEntry).max(30) }),
  z.object({ ...base, type: z.literal("projects"), entries: z.array(experienceEntry).max(30) }),
  z.object({ ...base, type: z.literal("involvement"), entries: z.array(experienceEntry).max(30) }),
  z.object({ ...base, type: z.literal("education"), entries: z.array(educationEntry).max(10) }),
  z.object({ ...base, type: z.literal("skills"), entries: z.array(skillsEntry).max(12) }),
  z.object({ ...base, type: z.literal("certifications"), entries: z.array(simpleEntry).max(20) }),
  z.object({ ...base, type: z.literal("coursework"), entries: z.array(simpleEntry).max(20) }),
]);

export const contact = z.object({
  fullName: text(120),
  email: text(160),
  phone: text(40),
  linkedin: text(100),
  website: text(200),
  city: text(80),
  country: text(80),
  showCountry: z.boolean(),
  state: text(80),
  showState: z.boolean(),
});

export const resumeContent = z.object({
  contact,
  summary: z.object({ text: text(1200) }),
  sections: z.array(section).max(12),
});

export const FONTS = ["Source Serif 4", "Merriweather", "Source Sans 3", "Carlito", "Tinos", "Inter"] as const;
export const TEMPLATES = ["standard", "compact", "modern"] as const;

export const resumeSettings = z.object({
  font: z.enum(FONTS),
  fontSize: z.number().min(8).max(12),
  sectionSpacing: z.number().int().min(0).max(6),
  divider: z.boolean(),
  icons: z.boolean(),
  accent: z.enum(["ink", "slate", "teal", "plum"]),
  pageSize: z.enum(["letter", "a4"]),
});

export type Bullet = z.infer<typeof bullet>;
export type ExperienceEntry = z.infer<typeof experienceEntry>;
export type EducationEntry = z.infer<typeof educationEntry>;
export type SkillsEntry = z.infer<typeof skillsEntry>;
export type SimpleEntry = z.infer<typeof simpleEntry>;
export type Section = z.infer<typeof section>;
export type Contact = z.infer<typeof contact>;
export type ResumeContent = z.infer<typeof resumeContent>;
export type ResumeSettings = z.infer<typeof resumeSettings>;
export type TemplateId = (typeof TEMPLATES)[number];

export const EXPERIENCE_LEVELS = [
  { value: "internship", label: "Internship" },
  { value: "entry", label: "Entry level" },
  { value: "associate", label: "Associate" },
  { value: "junior", label: "Junior" },
  { value: "mid_senior", label: "Mid–senior" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive" },
] as const;
export const experienceLevel = z.enum(["internship", "entry", "associate", "junior", "mid_senior", "director", "executive"]);
export type ExperienceLevel = z.infer<typeof experienceLevel>;

export const SECTION_LABELS: Record<SectionType, string> = {
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  involvement: "Involvement",
  certifications: "Certifications",
  coursework: "Coursework",
};

/* ------------------------------------------------------------ factories */

export function newId(prefix = "x") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function blankEntry(type: SectionType) {
  switch (type) {
    case "experience":
    case "projects":
    case "involvement":
      return { id: newId("e"), role: "", company: "", location: "", start: null, end: null, bullets: [{ id: newId("b"), text: "" }] };
    case "education":
      return { id: newId("e"), degree: "", institution: "", location: "", year: null, minor: "", gpa: "", extra: "" };
    case "skills":
      return { id: newId("e"), category: "", items: [] };
    case "certifications":
    case "coursework":
      return { id: newId("e"), name: "", issuer: "", year: null, detail: "" };
  }
}

export function blankSection(type: SectionType): Section {
  return { id: newId("s"), type, hidden: false, entries: [blankEntry(type)] } as Section;
}

export function blankContent(): ResumeContent {
  return {
    contact: {
      fullName: "", email: "", phone: "", linkedin: "", website: "", city: "",
      country: "", showCountry: true, state: "", showState: true,
    },
    summary: { text: "" },
    sections: [blankSection("experience"), blankSection("education"), blankSection("skills")],
  };
}

export const DEFAULT_SETTINGS: ResumeSettings = {
  font: "Source Serif 4",
  fontSize: 10,
  sectionSpacing: 3,
  divider: true,
  icons: false,
  accent: "ink",
  pageSize: "letter",
};

/* ------------------------------------------------------------ helpers */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(v: YearMonth | "present" | null) {
  if (v === "present") return "Present";
  if (!v) return "";
  return `${MONTHS[v.month - 1]} ${v.year}`;
}
export function formatRange(start: YearMonth | null, end: YearMonth | "present" | null) {
  const a = formatDate(start);
  const b = formatDate(end);
  return a && b ? `${a} – ${b}` : a || b;
}

export function sectionOf<T extends SectionType>(c: ResumeContent, type: T) {
  return c.sections.find((s) => s.type === type) as Extract<Section, { type: T }> | undefined;
}

/** Every piece of text on the resume, for word counts and keyword matching. */
export function allText(c: ResumeContent): string {
  const parts: string[] = [c.summary.text];
  for (const s of c.sections) {
    if (s.hidden) continue;
    for (const e of s.entries as Array<Record<string, unknown>>) {
      for (const [k, v] of Object.entries(e)) {
        if (k === "id") continue;
        if (typeof v === "string") parts.push(v);
        else if (Array.isArray(v)) for (const x of v) parts.push(typeof x === "string" ? x : (x as Bullet).text ?? "");
      }
    }
  }
  return parts.filter(Boolean).join("\n");
}
