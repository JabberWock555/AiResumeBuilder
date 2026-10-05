// Deterministic stand-in for the AI writer, used until a model is connected in
// /replica-backend. Same inputs and outputs as the real one. It never invents a
// fact: anything it can't know from the user's own text becomes a [placeholder].

export type BulletMode = "suggest" | "complete" | "quantify" | "rewrite";
export type WriteResult = { text: string; placeholders: string[]; model: "demo" };

const placeholders = (t: string) => [...t.matchAll(/\[[^\]]{1,24}\]/g)].map((m) => m[0]);
const out = (text: string): WriteResult => ({ text, placeholders: placeholders(text), model: "demo" });

const REPLACE: [RegExp, string][] = [
  [/^(i was|was) responsible for (helping with |helping )?/i, "Led "],
  [/^responsible for /i, "Owned "],
  [/^in charge of /i, "Ran "],
  [/^(tasked with|duties included) /i, "Delivered "],
  [/^worked on /i, "Built "],
  [/^(helped with|helped to|helped) /i, "Supported "],
  [/^(assisted with|assisted in|assisted) /i, "Supported "],
  [/^(involved in|participated in) /i, "Contributed to "],
];

function tidy(s: string) {
  let t = s.trim().replace(/\s+/g, " ").replace(/^[•\-–]\s*/, "");
  for (const [re, to] of REPLACE) {
    if (re.test(t)) {
      t = t.replace(re, to);
      break;
    }
  }
  t = t.replace(/\b(I|my|we|our)\b\s*/g, "").replace(/\s+/g, " ").trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.replace(/[.!?]+$/, "");
}

const hasNumber = (s: string) => /\d/.test(s);

export function writeBullet(input: { mode: BulletMode; text: string; role: string; company: string }): WriteResult {
  const { mode, role, company } = input;
  const at = company ? ` at ${company}` : "";
  if (!input.text.trim() || mode === "suggest") {
    return out(`Led [project or change]${role ? ` as ${role}` : ""}${at}, which [result, with a number if you have one].`);
  }
  const base = tidy(input.text);
  switch (mode) {
    case "complete":
      return out(`${base}${hasNumber(base) ? "" : ", which [what changed because of it]"}.`);
    case "quantify":
      return out(`${base}${hasNumber(base) ? "" : ", improving [metric] by [number]%"}.`);
    case "rewrite":
      return out(`${base}${hasNumber(base) ? "" : ", resulting in [result]"}.`);
  }
}

export function writeKeywordBullet(input: { term: string; role: string; company: string }): WriteResult {
  const at = input.company ? ` at ${input.company}` : "";
  return out(`Used ${input.term} to [what you did]${at}, which [result].`);
}

export function writeSummary(input: { position: string; skills: string[]; years: number | null; level: string }): WriteResult {
  const skills = input.skills.slice(0, 3);
  const list = skills.length > 1 ? `${skills.slice(0, -1).join(", ")} and ${skills.at(-1)}` : skills[0] ?? "[your main skills]";
  const years = input.years && input.years >= 1 ? `${input.years}+ years` : "[number] years";
  const who = input.position || "[your role]";
  return out(`${who} with ${years} of experience in ${list}. Known for [one result you're proud of]. Looking to [what you want next].`);
}
