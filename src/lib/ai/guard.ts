// The "no invented facts" check every AI result goes through before the user
// sees it. A model can be told not to add numbers; this makes sure. Any number
// in the output that isn't in the user's own text becomes a [number]
// placeholder, which the editor highlights and the download warns about.

const NUMBER = /(?<![\w[])[$€£]?\d(?:[\d,]*\d)?(?:\.\d+)?(?:\s?(?:%|percent|k|m|bn|x)\b|\+|%)?/gi;
const PLACEHOLDER = /\[[^\]\n]{1,24}\]/g;

/** "1,200" → "1200", "$3.5m" → "3.5": the bare value, for comparing. */
const value = (n: string) => n.replace(/[^\d.]/g, "").replace(/\.$/, "").replace(/^0+(?=\d)/, "");

export function placeholdersIn(text: string) {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[0]);
}

export function guardFacts(output: string, source: string) {
  const known = new Set([...source.matchAll(NUMBER)].map((m) => value(m[0])));
  let replaced = 0;
  const text = output.replace(NUMBER, (m) => {
    if (known.has(value(m))) return m;
    replaced++;
    return "[number]";
  });
  return { text, replaced, placeholders: placeholdersIn(text) };
}

/** One clean line: no list marker, quotes, label or trailing spaces. */
export function oneLine(raw: string) {
  return raw
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^(bullet|summary|answer)\s*:\s*/i, "")
    .replace(/^[-•*–]\s*/, "")
    .replace(/^["“'](.*)["”']$/, "$1")
    .trim() ?? "";
}

/** A summary may be a short paragraph: join lines, drop labels and quotes. */
export function paragraph(raw: string) {
  return raw
    .trim()
    .replace(/^(summary)\s*:\s*/i, "")
    .replace(/^["“]([\s\S]*)["”]$/, "$1")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}
