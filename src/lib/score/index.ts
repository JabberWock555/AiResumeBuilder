import {
  EXPERIENCE_LIKE,
  allText,
  type Bullet,
  type ExperienceEntry,
  type ResumeContent,
  type SectionType,
  type SkillsEntry,
} from "@/lib/resume/schema";
import { BUZZWORDS, FILLERS, PRONOUNS, WEAK_OPENERS } from "./words";
import { keywordCoverage, matchKeywords, type Keyword, type KeywordStatus } from "./keywords";

export const CATEGORIES = ["content", "format", "optimization", "practices", "ready"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  content: "Content",
  format: "Format",
  optimization: "Job match",
  practices: "Best practices",
  ready: "Ready to send",
};
const CATEGORY_WEIGHT: Record<Category, number> = { content: 0.35, format: 0.2, optimization: 0.2, practices: 0.15, ready: 0.1 };

export type Severity = "error" | "warning" | "pass";
export type Check = {
  id: string;
  category: Category;
  severity: Severity;
  /** 0..1, how much of this check is satisfied. */
  value: number;
  weight: number;
  title: string;
  detail: string;
  sectionType?: SectionType;
  entryId?: string;
  entryLabel?: string;
};
export type BulletIssue = { bulletId: string; severity: "error" | "warning"; message: string };

export type ScoreReport = {
  total: number;
  categories: Record<Category, number>;
  checks: Check[];
  bulletIssues: BulletIssue[];
  keywords: KeywordStatus[] | null;
  wordCount: number;
  pages: number;
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const lc = (s: string) => s.toLowerCase();
const hasNumber = (s: string) => /(\d|%|\$|£|€)/.test(s.replace(/\[[^\]]*\]/g, ""));
const PLACEHOLDER = /\[[^\]]{1,24}\]/;
const wordRe = (w: string) => new RegExp(`(^|[^a-z])${w.replace(/[-]/g, "[- ]?")}($|[^a-z])`, "i");

function weakOpener(t: string) {
  const s = lc(t).replace(/^[•\-–\s]+/, "");
  return WEAK_OPENERS.find((w) => s === w || s.startsWith(w + " "));
}
const found = (t: string, list: string[]) => list.filter((w) => wordRe(w).test(t));
const isPassive = (t: string) => /\b(was|were|been|being|is|are)\s+([a-z]+ed|built|made|done|given|led|run|written|shown|seen)\b/i.test(t);

function mk(c: Omit<Check, "value" | "weight"> & { value?: number; weight?: number }): Check {
  const value = c.value ?? (c.severity === "pass" ? 1 : c.severity === "warning" ? 0.5 : 0);
  return { weight: 1, ...c, value };
}

function entryLabel(e: ExperienceEntry) {
  return e.role || e.company || "Untitled entry";
}

function filled(b: Bullet[]) {
  return b.filter((x) => x.text.trim());
}

/** All checks for one experience-like entry. Ids are stable so the UI can key on them. */
function entryChecks(type: SectionType, e: ExperienceEntry, issues: BulletIssue[]): Check[] {
  const out: Check[] = [];
  const bs = filled(e.bullets);
  const base = { sectionType: type, entryId: e.id, entryLabel: entryLabel(e) };
  const issue = (b: Bullet, severity: BulletIssue["severity"], message: string) => issues.push({ bulletId: b.id, severity, message });

  const unpunct = bs.filter((b) => !/^[A-Z0-9"“(]/.test(b.text.trim()) || !/[.!?]["”)]?$/.test(b.text.trim()));
  unpunct.forEach((b) => issue(b, "error", "Start with a capital letter and end with a full stop."));
  out.push(
    mk({
      ...base, id: `${e.id}:punct`, category: "content",
      severity: unpunct.length ? "error" : "pass",
      title: unpunct.length ? "Bullets need a capital and a full stop" : "Bullets are punctuated",
      detail: unpunct.length ? `${unpunct.length} of ${bs.length} bullets in ${base.entryLabel}.` : "Every bullet starts with a capital and ends with a full stop.",
    }),
  );

  const weak = bs.filter((b) => weakOpener(b.text));
  weak.forEach((b) => issue(b, "warning", `“${weakOpener(b.text)}” describes a duty. Start with what you did: led, built, cut, grew.`));
  out.push(
    mk({
      ...base, id: `${e.id}:weak`, category: "content",
      severity: weak.length ? "warning" : "pass",
      title: weak.length ? "Weak opening words" : "Bullets start with action",
      detail: weak.length ? `${weak.length} bullet${weak.length > 1 ? "s" : ""} open with a duty instead of an action.` : "Each bullet starts with what you did.",
    }),
  );

  const pron = bs.flatMap((b) => found(b.text, PRONOUNS).map((w) => ({ b, w })));
  pron.forEach(({ b, w }) => issue(b, "warning", `Drop “${w}”. Resumes are written without pronouns.`));
  out.push(
    mk({
      ...base, id: `${e.id}:pronoun`, category: "content",
      severity: pron.length ? "warning" : "pass",
      title: pron.length ? "Personal pronouns" : "No personal pronouns",
      detail: pron.length ? `Found “${[...new Set(pron.map((p) => p.w))].join("”, “")}”.` : "No “I”, “my” or “we”.",
    }),
  );

  const buzz = bs.flatMap((b) => found(b.text, BUZZWORDS).map((w) => ({ b, w })));
  buzz.forEach(({ b, w }) => issue(b, "warning", `“${w}” is a cliché. Show it with a result instead.`));
  out.push(
    mk({
      ...base, id: `${e.id}:buzz`, category: "content", weight: 0.5,
      severity: buzz.length ? "warning" : "pass",
      title: buzz.length ? "Clichés" : "No clichés",
      detail: buzz.length ? `Found “${[...new Set(buzz.map((p) => p.w))].join("”, “")}”.` : "No filler phrases like “team player”.",
    }),
  );

  const passive = bs.filter((b) => isPassive(b.text));
  passive.forEach((b) => issue(b, "warning", "Passive voice. Say who did it: “Cut costs”, not “Costs were cut”."));
  const fill = bs.flatMap((b) => found(b.text, FILLERS).map((w) => ({ b, w })));
  fill.forEach(({ b, w }) => issue(b, "warning", `“${w}” adds nothing. Remove it.`));
  out.push(
    mk({
      ...base, id: `${e.id}:style`, category: "content", weight: 0.5,
      severity: passive.length || fill.length ? "warning" : "pass",
      title: passive.length || fill.length ? "Passive voice or filler words" : "Direct and active",
      detail:
        passive.length || fill.length
          ? [passive.length && `${passive.length} passive`, fill.length && `${fill.length} filler word${fill.length > 1 ? "s" : ""}`].filter(Boolean).join(", ") + "."
          : "No passive voice or filler words.",
    }),
  );

  const long = bs.filter((b) => words(b.text).length > 35);
  const short = bs.filter((b) => words(b.text).length < 5);
  long.forEach((b) => issue(b, "warning", `${words(b.text).length} words. Keep bullets under 35.`));
  short.forEach((b) => issue(b, "warning", "Too short to show a result. Add what changed because of it."));
  out.push(
    mk({
      ...base, id: `${e.id}:length`, category: "content", weight: 0.5,
      severity: long.length || short.length ? "warning" : "pass",
      title: long.length || short.length ? "Bullet length" : "Bullets are a good length",
      detail: long.length || short.length ? "Aim for 8 to 30 words per bullet." : "Between 5 and 35 words each.",
    }),
  );

  const holes = bs.filter((b) => PLACEHOLDER.test(b.text));
  holes.forEach((b) => issue(b, "error", "Replace the [bracketed] part with your real figure, or remove it."));
  if (holes.length)
    out.push(
      mk({
        ...base, id: `${e.id}:holes`, category: "ready", severity: "error", weight: 2,
        title: "Unfilled placeholders",
        detail: `${holes.length} bullet${holes.length > 1 ? "s" : ""} still have a [placeholder]. Use your real number or remove it.`,
      }),
    );

  const quant = bs.filter((b) => hasNumber(b.text)).length;
  out.push(
    mk({
      ...base, id: `${e.id}:numbers`, category: "content",
      severity: bs.length && quant / bs.length >= 0.5 ? "pass" : "warning",
      value: bs.length ? Math.min(1, quant / bs.length / 0.5) : 0,
      title: bs.length && quant / bs.length >= 0.5 ? "Results have numbers" : "Add numbers where you can",
      detail: `${quant} of ${bs.length} bullets have a figure. Real numbers only: people, money, time, percent.`,
    }),
  );

  const n = bs.length;
  out.push(
    mk({
      ...base, id: `${e.id}:count`, category: "format",
      severity: n >= 3 && n <= 6 ? "pass" : n === 0 ? "error" : "warning",
      title: n >= 3 && n <= 6 ? "Bullets per role" : n === 0 ? "No bullets yet" : n < 3 ? "Too few bullets" : "Too many bullets",
      detail: `${n} bullet${n === 1 ? "" : "s"}. Aim for 3 to 6 for each role.`,
    }),
  );

  const bad =
    e.start && e.end && e.end !== "present" && (e.end.year < e.start.year || (e.end.year === e.start.year && e.end.month < e.start.month));
  out.push(
    mk({
      ...base, id: `${e.id}:dates`, category: "format", weight: 0.5,
      severity: bad ? "error" : !e.start || !e.end ? "warning" : "pass",
      title: bad ? "End date is before the start date" : !e.start || !e.end ? "Dates missing" : "Dates are complete",
      detail: bad ? "Check the dates for this entry." : !e.start || !e.end ? "Add a start and end month (or Present)." : "Start and end are set.",
    }),
  );
  return out;
}

export function scoreResume(c: ResumeContent, target?: { keywords: Keyword[]; dismissed: string[] } | null): ScoreReport {
  const checks: Check[] = [];
  const bulletIssues: BulletIssue[] = [];
  const text = allText(c);
  const wordCount = words(text).length + words(c.contact.fullName).length;
  const pages = Math.round((wordCount / 480) * 10) / 10;

  // contact
  const missing = [
    !c.contact.fullName.trim() && "name",
    !c.contact.email.trim() && "email",
    !c.contact.phone.trim() && "phone",
  ].filter(Boolean) as string[];
  const emailBad = c.contact.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact.email.trim());
  checks.push(
    mk({
      id: "contact", category: "practices", weight: 2, sectionType: undefined,
      severity: missing.length || emailBad ? "error" : "pass",
      title: missing.length ? "Contact details missing" : emailBad ? "Email looks wrong" : "Contact details complete",
      detail: missing.length ? `Add your ${missing.join(", ")}.` : emailBad ? "Check the email address." : "Name, email and phone are there.",
    }),
  );

  // summary
  const sw = words(c.summary.text).length;
  checks.push(
    mk({
      id: "summary", category: "practices",
      severity: sw === 0 ? "warning" : sw > 90 ? "warning" : "pass",
      title: sw === 0 ? "No summary" : sw > 90 ? "Summary is long" : "Summary",
      detail: sw === 0 ? "Two or three lines on who you are and what you're after." : sw > 90 ? `${sw} words. Keep it under 90.` : `${sw} words.`,
    }),
  );

  // entries
  let experienceEntries = 0;
  for (const s of c.sections) {
    if (s.hidden) continue;
    if ((EXPERIENCE_LIKE as readonly string[]).includes(s.type)) {
      for (const e of s.entries as ExperienceEntry[]) {
        const used = e.role.trim() || e.company.trim() || filled(e.bullets).length;
        if (!used) continue;
        if (s.type === "experience") experienceEntries++;
        checks.push(...entryChecks(s.type, e, bulletIssues));
      }
    }
  }
  checks.push(
    mk({
      id: "has-experience", category: "format", weight: 2, sectionType: "experience",
      severity: experienceEntries ? "pass" : "error",
      title: experienceEntries ? "Experience section" : "No experience yet",
      detail: experienceEntries ? `${experienceEntries} role${experienceEntries > 1 ? "s" : ""}.` : "Add at least one role, project or internship.",
    }),
  );
  const edu = c.sections.find((s) => s.type === "education" && !s.hidden);
  const eduCount = edu ? edu.entries.filter((e) => "degree" in e && (e.degree.trim() || e.institution.trim())).length : 0;
  checks.push(
    mk({
      id: "has-education", category: "format", sectionType: "education",
      severity: eduCount ? "pass" : "warning",
      title: eduCount ? "Education section" : "No education listed",
      detail: eduCount ? `${eduCount} entr${eduCount > 1 ? "ies" : "y"}.` : "Add your highest qualification, or a course.",
    }),
  );

  // length
  checks.push(
    mk({
      id: "words", category: "practices",
      severity: wordCount >= 350 && wordCount <= 850 ? "pass" : "warning",
      value: wordCount >= 350 && wordCount <= 850 ? 1 : wordCount < 350 ? wordCount / 350 : Math.max(0.3, 850 / wordCount),
      title: "Length",
      detail: `${wordCount} words. Most one-page resumes land between 350 and 850.`,
    }),
  );
  checks.push(
    mk({
      id: "pages", category: "format",
      severity: pages >= 0.7 && pages <= 2 ? "pass" : "warning",
      value: pages >= 0.7 && pages <= 2 ? 1 : pages < 0.7 ? pages / 0.7 : 0.5,
      title: pages < 0.7 ? `Fills about ${Math.max(0.1, pages)} of a page` : pages > 2 ? "Longer than two pages" : "Page length",
      detail: pages < 0.7 ? "A full page reads as complete. Add bullets with results." : pages > 2 ? "Cut older or less relevant roles." : "A good length.",
    }),
  );

  // skills + keywords
  const skillItems = c.sections
    .filter((s) => s.type === "skills" && !s.hidden)
    .flatMap((s) => s.entries as SkillsEntry[])
    .reduce((n, e) => n + e.items.filter(Boolean).length, 0);
  checks.push(
    mk({
      id: "skills", category: "optimization", sectionType: "skills",
      severity: skillItems >= 6 ? "pass" : skillItems ? "warning" : "error",
      title: skillItems >= 6 ? "Skills listed" : "Add more skills",
      detail: `${skillItems} skill${skillItems === 1 ? "" : "s"}. List at least 6 you can talk about.`,
    }),
  );

  let keywords: KeywordStatus[] | null = null;
  if (target && target.keywords.length) {
    keywords = matchKeywords(text, target.keywords, target.dismissed);
    const cov = keywordCoverage(keywords);
    const miss = keywords.filter((k) => k.status === "missing");
    checks.push(
      mk({
        id: "keywords", category: "optimization", weight: 3, value: cov,
        severity: cov >= 0.8 ? "pass" : cov >= 0.5 ? "warning" : "error",
        title: miss.length ? `${miss.length} job keyword${miss.length > 1 ? "s" : ""} missing` : "Matches the job ad",
        detail: miss.length ? `Missing: ${miss.slice(0, 4).map((k) => k.term).join(", ")}${miss.length > 4 ? "…" : ""}.` : "Every keyword from the ad is in your resume.",
      }),
    );
  } else {
    checks.push(
      mk({
        id: "keywords", category: "optimization", weight: 1, value: 0.5,
        severity: "warning",
        title: "No job ad added",
        detail: "Add the job ad you're applying to and we'll check its keywords.",
      }),
    );
  }

  // category scores
  const categories = {} as Record<Category, number>;
  for (const cat of CATEGORIES) {
    const cs = checks.filter((x) => x.category === cat);
    const w = cs.reduce((n, x) => n + x.weight, 0);
    categories[cat] = w ? Math.round((100 * cs.reduce((n, x) => n + x.weight * x.value, 0)) / w) : 100;
  }
  const errors = checks.filter((x) => x.severity === "error").length;
  const warnings = checks.filter((x) => x.severity === "warning").length;
  const ready = Math.max(0, Math.min(100, 100 - errors * 15 - warnings * 3));
  categories.ready = checks.some((x) => x.category === "ready") ? Math.min(categories.ready, ready) : ready;
  checks.push(
    mk({
      id: "ready", category: "ready",
      severity: errors ? "error" : warnings > 4 ? "warning" : "pass",
      value: ready / 100,
      title: errors ? `${errors} thing${errors > 1 ? "s" : ""} to fix before sending` : warnings > 4 ? "Nearly ready" : "Ready to send",
      detail: errors ? "Fix the errors above first." : warnings > 4 ? "A few small improvements left." : "No errors left.",
    }),
  );

  const total = Math.round(CATEGORIES.reduce((n, cat) => n + categories[cat] * CATEGORY_WEIGHT[cat], 0));
  return { total, categories, checks, bulletIssues, keywords, wordCount, pages };
}
