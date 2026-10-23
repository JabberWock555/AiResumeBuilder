import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { config } from "../config";
import { guardFacts, oneLine, paragraph } from "@/lib/ai/guard";
import * as demo from "@/lib/ai/demo";
import { extractKeywords, type Keyword } from "@/lib/score/keywords";

// The AI writer. With an AI Gateway key it calls a model (fast one for inline
// bullets, stronger one for summaries, keyword bullets and keyword
// extraction); without one it falls back to the deterministic demo writer.
// Either way the result goes through guardFacts(), so a number the user
// didn't give never reaches their resume.

export type WriteResult = { text: string; placeholders: string[]; model: string; inputTokens?: number; outputTokens?: number };

const RULES = `You help someone write their resume. Rules you must follow:
- Use only facts in the text you're given. Never invent a number, percentage, amount, team size, duration, date, tool, employer or result.
- Where a number or result would make it stronger and you don't have it, write a short placeholder in square brackets instead, like [number], [%], [result] or [team size]. Keep placeholders under 20 characters.
- Plain, specific English. Start bullets with a strong past-tense verb (present tense for a current role). No first person, no buzzwords, no exclamation marks.
- Answer with the text only: no preamble, quotes, labels or explanations.`;

const MODE: Record<demo.BulletMode, string> = {
  suggest: "Write one new bullet for this role that doesn't repeat the existing ones. It will mostly be placeholders if there's little to go on; that's fine.",
  complete: "Finish and improve the draft bullet. You may change its first word to a stronger verb. Keep every fact it states.",
  quantify: "Rewrite the bullet so it shows scale or impact. Use the numbers it already has; where it has none, add placeholders for them.",
  rewrite: "Rewrite the bullet to be clearer and stronger, under 30 words. Keep every fact it states and add none.",
};

async function run(model: string, prompt: string, maxOutputTokens: number) {
  const r = await generateText({ model, system: RULES, prompt, maxOutputTokens, temperature: 0.4, maxRetries: 1, timeout: 20_000 });
  return { raw: r.text, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
}

function finish(raw: string, source: string, model: string, usage: { inputTokens?: number; outputTokens?: number }, shape = oneLine): WriteResult {
  const cleaned = shape(raw);
  if (!cleaned) throw new Error("empty AI answer");
  const g = guardFacts(cleaned, source);
  return { text: g.text, placeholders: g.placeholders, model, ...usage };
}

export async function writeBullet(i: {
  mode: demo.BulletMode; text: string; role: string; company: string; otherBullets: string[]; level: string; targetTitle?: string; source: string;
}): Promise<WriteResult> {
  if (!config.ai) {
    const d = demo.writeBullet(i);
    return { ...d, ...guardFacts(d.text, i.source) };
  }
  const prompt = [
    MODE[i.mode],
    `Role: ${i.role || "(not given)"}${i.company ? ` at ${i.company}` : ""}. Experience level: ${i.level}.`,
    i.targetTitle ? `They're applying for: ${i.targetTitle}.` : "",
    i.otherBullets.length ? `Other bullets for this role:\n${i.otherBullets.map((b) => `- ${b}`).join("\n")}` : "",
    i.text.trim() ? `The bullet to work on:\n${i.text.trim()}` : "",
    "Answer with one bullet.",
  ].filter(Boolean).join("\n\n");
  const model = config.models.fast;
  const r = await run(model, prompt, 160);
  return finish(r.raw, i.source, model, r);
}

export async function writeKeywordBullet(i: { term: string; role: string; company: string; bullets: string[]; source: string }): Promise<WriteResult> {
  if (!config.ai) {
    const d = demo.writeKeywordBullet(i);
    return { ...d, ...guardFacts(d.text, i.source) };
  }
  const prompt = [
    `Write one bullet for this role that honestly shows the skill "${i.term}". If nothing in the bullets suggests they used it, write the bullet with placeholders for what they did with it, so they can fill it in or delete it.`,
    `Role: ${i.role || "(not given)"}${i.company ? ` at ${i.company}` : ""}.`,
    i.bullets.length ? `Their bullets for this role:\n${i.bullets.map((b) => `- ${b}`).join("\n")}` : "",
    "Answer with one bullet.",
  ].filter(Boolean).join("\n\n");
  const model = config.models.strong;
  const r = await run(model, prompt, 160);
  return finish(r.raw, i.source, model, r);
}

export async function writeSummary(i: {
  position: string; skills: string[]; years: number | null; level: string; roles: string[]; source: string;
}): Promise<WriteResult> {
  if (!config.ai) {
    const d = demo.writeSummary(i);
    return { ...d, ...guardFacts(d.text, i.source) };
  }
  const prompt = [
    "Write a resume summary of 2 or 3 sentences, under 60 words, in the third person without pronouns.",
    `Position they want: ${i.position || "(not given)"}. Experience level: ${i.level}.`,
    i.years !== null ? `Years of experience (from their dates): ${i.years}.` : "Years of experience: unknown, use [number].",
    i.skills.length ? `Their skills: ${i.skills.join(", ")}.` : "",
    i.roles.length ? `Their roles:\n${i.roles.map((r) => `- ${r}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const model = config.models.strong;
  const r = await run(model, prompt, 220);
  // The computed years count as the user's own fact.
  return finish(r.raw, `${i.source} ${i.years ?? ""}`, model, r, paragraph);
}

const keywordSchema = z.object({
  keywords: z
    .array(
      z.object({
        term: z.string().min(1).max(60),
        aliases: z.array(z.string().max(60)).max(5),
        weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        kind: z.enum(["skill", "tool", "cert", "domain", "soft"]),
      }),
    )
    .max(20),
});

/**
 * The keywords a recruiter or ATS would look for in a job ad. Falls back to the
 * rule-based extractor when there's no model or the call fails, so setting a
 * target never breaks.
 */
export async function extractJobKeywords(jobAd: string): Promise<{ keywords: Keyword[]; model: string; inputTokens?: number; outputTokens?: number }> {
  if (!config.ai) return { keywords: extractKeywords(jobAd), model: "rules" };
  try {
    const model = config.models.strong;
    const r = await generateText({
      model,
      system:
        "You pick out the keywords a recruiter or applicant tracking system would look for in a job ad: hard skills, tools, certifications, domain terms and a few soft skills. Use the ad's own wording for each term. Aliases are other common spellings (\"JS\" for \"JavaScript\"). Weight 3 for must-haves, 2 for repeated or emphasised, 1 for nice-to-have. At most 15, most important first. Skip generic words like \"team\" or \"work\".",
      prompt: jobAd.slice(0, 12000),
      output: Output.object({ schema: keywordSchema }),
      maxOutputTokens: 1200,
      temperature: 0,
      maxRetries: 1,
      timeout: 25_000,
    });
    const seen = new Set<string>();
    const keywords = r.output.keywords.filter((k) => {
      const key = k.term.toLowerCase();
      return !seen.has(key) && seen.add(key);
    });
    if (!keywords.length) throw new Error("no keywords");
    return { keywords, model, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
  } catch (e) {
    console.error(`keyword extraction fell back to rules: ${e instanceof Error ? e.message : e}`);
    return { keywords: extractKeywords(jobAd), model: "rules" };
  }
}
