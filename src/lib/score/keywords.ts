// Job-ad keywords: extraction (fallback, used until the AI extractor is
// connected in /replica-backend) and matching (always deterministic, so the
// panel, the highlights and the Optimization score agree).

export type Keyword = {
  term: string;
  aliases: string[];
  weight: 1 | 2 | 3;
  kind: "skill" | "tool" | "cert" | "domain" | "soft";
};

/** term → aliases. Terms are what we show; aliases also count as a match. */
const KNOWN: Record<string, { aliases?: string[]; kind: Keyword["kind"] }> = {
  // tools
  Figma: { kind: "tool" }, Sketch: { kind: "tool" }, "Adobe XD": { kind: "tool" }, Photoshop: { kind: "tool" },
  Illustrator: { kind: "tool" }, Jira: { kind: "tool" }, Confluence: { kind: "tool" }, Notion: { kind: "tool" },
  Excel: { kind: "tool", aliases: ["spreadsheets"] }, "Google Analytics": { kind: "tool", aliases: ["GA4"] },
  Salesforce: { kind: "tool" }, HubSpot: { kind: "tool" }, Tableau: { kind: "tool" }, "Power BI": { kind: "tool" },
  Looker: { kind: "tool" }, Git: { kind: "tool", aliases: ["GitHub", "GitLab"] }, Docker: { kind: "tool" },
  Kubernetes: { kind: "tool", aliases: ["k8s"] }, AWS: { kind: "tool", aliases: ["Amazon Web Services"] },
  GCP: { kind: "tool", aliases: ["Google Cloud"] }, Azure: { kind: "tool" }, Terraform: { kind: "tool" },
  // languages and frameworks
  JavaScript: { kind: "skill", aliases: ["JS"] }, TypeScript: { kind: "skill", aliases: ["TS"] },
  Python: { kind: "skill" }, Java: { kind: "skill" }, Go: { kind: "skill", aliases: ["Golang"] }, Rust: { kind: "skill" },
  "C++": { kind: "skill" }, "C#": { kind: "skill" }, Ruby: { kind: "skill" }, PHP: { kind: "skill" }, Swift: { kind: "skill" },
  Kotlin: { kind: "skill" }, SQL: { kind: "skill", aliases: ["PostgreSQL", "MySQL", "Postgres"] }, React: { kind: "skill", aliases: ["React.js", "ReactJS"] },
  "Next.js": { kind: "skill", aliases: ["NextJS"] }, "Node.js": { kind: "skill", aliases: ["Node", "NodeJS"] },
  "Vue.js": { kind: "skill", aliases: ["Vue"] }, Angular: { kind: "skill" }, HTML: { kind: "skill", aliases: ["HTML5"] },
  CSS: { kind: "skill", aliases: ["CSS3"] }, GraphQL: { kind: "skill" }, "REST APIs": { kind: "skill", aliases: ["REST", "RESTful"] },
  "Machine learning": { kind: "skill", aliases: ["ML"] }, "Data analysis": { kind: "skill", aliases: ["data analytics"] },
  // practices
  "User research": { kind: "skill", aliases: ["UX research"] }, "Usability testing": { kind: "skill", aliases: ["user testing"] },
  Wireframing: { kind: "skill", aliases: ["wireframes"] }, Prototyping: { kind: "skill", aliases: ["prototypes"] },
  "Interaction design": { kind: "skill" }, "Information architecture": { kind: "skill" },
  "Design systems": { kind: "skill", aliases: ["design system"] }, Accessibility: { kind: "skill", aliases: ["WCAG", "a11y"] },
  "A/B testing": { kind: "skill", aliases: ["AB testing", "experimentation"] }, "Product management": { kind: "skill" },
  Agile: { kind: "skill", aliases: ["Scrum", "Kanban"] }, "Project management": { kind: "skill" },
  "Stakeholder management": { kind: "soft", aliases: ["stakeholders"] }, SEO: { kind: "skill", aliases: ["search engine optimization"] },
  "Content strategy": { kind: "skill" }, "Email marketing": { kind: "skill" }, "Paid social": { kind: "skill" },
  CRM: { kind: "skill" }, "Financial modeling": { kind: "skill", aliases: ["financial modelling"] }, Forecasting: { kind: "skill" },
  Budgeting: { kind: "skill" }, "Customer success": { kind: "domain" }, "B2B": { kind: "domain" }, SaaS: { kind: "domain" },
  "CI/CD": { kind: "skill", aliases: ["continuous integration"] }, Testing: { kind: "skill", aliases: ["unit tests", "test automation"] },
  // soft
  Communication: { kind: "soft" }, Leadership: { kind: "soft" }, Mentoring: { kind: "soft", aliases: ["mentorship"] },
  Collaboration: { kind: "soft", aliases: ["cross-functional"] }, "Problem solving": { kind: "soft", aliases: ["problem-solving"] },
  // certs
  PMP: { kind: "cert" }, CPA: { kind: "cert" }, CFA: { kind: "cert" }, "Google Ads certification": { kind: "cert" },
};

const STOP = new Set(
  "a an and or the of to in on for with by at from as is are be will you your our we us they this that these those it its we're you'll who what when where how etc e.g i.e including such about into across within per via using use able strong excellent good great new work working team role job company years year experience".split(
    " ",
  ),
);

export function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(w: string) {
  return w.length > 4 ? w.replace(/(ing|ings|ed|es|s)$/, "") : w;
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does this term (or an alias, or a simple plural/verb form) appear in the text? */
export function containsTerm(text: string, k: Pick<Keyword, "term" | "aliases">) {
  const hay = ` ${normalise(text)} `;
  for (const t of [k.term, ...k.aliases]) {
    const n = normalise(t);
    if (!n) continue;
    const words = n.split(" ").map(stem).map(escape);
    const re = new RegExp(`(^|[^a-z0-9])${words.join("[a-z]*\\s+")}[a-z]*($|[^a-z0-9+#])`);
    if (re.test(hay)) return true;
  }
  return false;
}

/**
 * Fallback extractor: known skills/tools in the ad, plus capitalised phrases
 * and acronyms the ad repeats. Weighted by how often they appear.
 */
export function extractKeywords(jobAd: string, max = 14): Keyword[] {
  const found = new Map<string, Keyword & { count: number }>();
  const add = (k: Keyword, count: number) => {
    const key = normalise(k.term);
    const prev = found.get(key);
    if (prev) prev.count += count;
    else found.set(key, { ...k, count });
  };

  for (const [term, meta] of Object.entries(KNOWN)) {
    const k = { term, aliases: meta.aliases ?? [], kind: meta.kind, weight: 1 as const };
    if (containsTerm(jobAd, k)) {
      const count = (jobAd.toLowerCase().match(new RegExp(escape(term.toLowerCase()), "g")) ?? []).length || 1;
      add(k, count + (meta.kind === "soft" ? 0 : 1));
    }
  }

  // Acronyms (2-5 capitals) and Capitalised Multi Word phrases mentioned at least twice.
  const counts = new Map<string, number>();
  for (const m of jobAd.matchAll(/\b([A-Z]{2,5})\b|\b([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})\b/g)) {
    const t = (m[1] ?? m[2]).trim();
    if (STOP.has(t.toLowerCase())) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const [t, c] of counts) {
    const alreadyKnown = [...found.values()].some((k) => containsTerm(t, k));
    if (c >= 2 && !alreadyKnown) add({ term: t, aliases: [], kind: "domain", weight: 1 }, c);
  }

  return [...found.values()]
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, max)
    .map(({ count, ...k }) => ({ ...k, weight: (count >= 3 ? 3 : count === 2 ? 2 : 1) as Keyword["weight"] }));
}

export type KeywordStatus = Keyword & { status: "matched" | "missing" | "dismissed" };

export function matchKeywords(resumeText: string, keywords: Keyword[], dismissed: string[] = []): KeywordStatus[] {
  const off = new Set(dismissed.map(normalise));
  return keywords.map((k) => ({
    ...k,
    status: containsTerm(resumeText, k) ? "matched" : off.has(normalise(k.term)) ? "dismissed" : "missing",
  }));
}

/** Share of keyword weight the resume covers (dismissed ones don't count against you). */
export function keywordCoverage(statuses: KeywordStatus[]) {
  const counted = statuses.filter((s) => s.status !== "dismissed");
  const total = counted.reduce((n, s) => n + s.weight, 0);
  if (!total) return 1;
  return counted.filter((s) => s.status === "matched").reduce((n, s) => n + s.weight, 0) / total;
}
