# Architecture: resume builder (a rebuild of Rezi's core features)

Reads `replica/recon.md` (screens S01-S36, flows F01-F10) and
`replica/features.csv`. The working name is a placeholder until `/replica-brand`.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript | one codebase for the marketing pages, the app and the API routes; server components keep the editor's first load fast |
| styling | Tailwind with tokens from `/replica-design` | the design system becomes CSS variables, not one-off values |
| editor state | React + zod, autosave with debounce | the resume is one typed document (below); zod validates it in the browser and on the server |
| database | Postgres on Supabase | RLS gives per-user access rules in the database itself; storage and auth come with it |
| data access | supabase-js with generated types, SQL migrations | the content is one jsonb document, so an ORM adds little; RLS needs the user's own client anyway |
| auth | Supabase Auth: email + password, Google, later Apple | covers S05/S06 and password reset; no separate auth vendor |
| AI | AI SDK through the Vercel AI Gateway: Claude Haiku 4.5 for inline bullet completion, Claude Sonnet 5.5 for summaries, keyword bullets, job-ad keyword extraction and import parsing | fast and cheap where it runs on every click, stronger where accuracy matters; the gateway gives fallbacks and cost tracking. Slugs checked: `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-5.5` (no Haiku 5.x on the gateway) |
| PDF | HTML/CSS templates printed by headless Chromium (`puppeteer-core` + `@sparticuz/chromium`) in a Node function | the preview and the PDF are the same HTML, so they match, and the PDF has a real text layer for ATS |
| DOCX | `docx` npm package, built from the same document | Word users need an editable file; it follows the template's structure, not pixel for pixel |
| file parsing | `unpdf` (PDF text), `mammoth` (DOCX text), then the LLM into the zod schema | standard libraries; the LLM only maps text to fields |
| payments | Stripe Checkout + Billing + Customer Portal | monthly and quarterly subscriptions, a one-off lifetime payment, and cancel in one click; Adaptive Pricing for local currency (S17) |
| email | Resend, as Supabase Auth's SMTP | sign-up, reset and receipt emails from your own domain |
| jobs | Vercel Cron, configured in `vercel.ts` | 4 small scheduled jobs; nothing needs a queue yet |
| files | Supabase Storage, private buckets `imports` and `photos` | uploads go straight from the browser with a per-user folder rule |
| rate limiting | Vercel Firewall rules for anonymous routes, a Postgres count for per-user AI calls | no extra service |
| hosting | Vercel (Fluid Compute, Node 24) | Next.js native; the PDF function needs the Node runtime, not Edge |
| errors | Sentry or Vercel Observability | set up in `/replica-deploy` |

One database, one app, no microservices.

**The user creates these accounts and keys** (Claude never signs up or types a
key): Supabase project, Stripe account (test mode first), Google OAuth client,
Resend, Vercel project with an AI Gateway key. Claude writes `.env.example`.

```
NEXT_PUBLIC_SUPABASE_URL=            NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=           AI_GATEWAY_API_KEY=
STRIPE_SECRET_KEY=                   STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_MONTH=                  STRIPE_PRICE_QUARTER=        STRIPE_PRICE_LIFETIME=
NEXT_PUBLIC_APP_URL=                 CRON_SECRET=
```

## The resume document

Each resume's content is one jsonb document, validated by zod in
`lib/resume/schema.ts`. Every entry and bullet has a stable id so the score,
the keyword targeting and the AI can point at it (Rezi's report links to the
entry, S25).

```ts
type ResumeContent = {
  contact: {
    fullName: string; email: string; phone: string;
    linkedin: string;            // handle only; the prefix is fixed (S18)
    website: string;
    country: string; showCountry: boolean;
    state: string;   showState: boolean;
    city: string;
  };
  summary: { text: string; fromResume: boolean };
  sections: Section[];           // array order = display order
};

type Section = {
  id: string;
  type: 'experience' | 'education' | 'skills' | 'projects' | 'certifications'
      | 'coursework' | 'involvement' | 'awards' | 'publications'
      | 'references' | 'military';
  title?: string;                // renamed heading
  hidden: boolean;
  entries: Entry[];
};

type YearMonth = { year: number; month: number };   // no days, no time zones

type ExperienceEntry = {
  id: string; role: string; company: string; location: string;
  start: YearMonth | null; end: YearMonth | 'present' | null;
  bullets: { id: string; text: string }[];
};
type EducationEntry = {
  id: string; degree: string; institution: string; location: string;
  year: number | null; minor: string; gpa: string; extra: string;
};
type SkillsEntry = { id: string; category: string; items: string[] };
// projects / involvement reuse ExperienceEntry's shape; the rest are small variants
```

Settings (`resumes.settings`): `font`, `fontSize`, `sectionSpacing`, `divider`,
`indent`, `icons`, `photoPath`, `textColor`, `accentColor`, `viewAsPages`.

## Schema

Tables: 12 (`profiles`, `subscriptions`, `stripe_events`, `plan_limits`,
`usage_counters`, `folders`, `resumes`, `resume_versions`, `target_jobs`,
`ai_generations`, `exports`, `imports`) plus 2 storage buckets.
Access rules: **Postgres row level security on every table.** The full SQL is
in `supabase/migrations/` (`0001_init.sql`, `0002_backend.sql`).

Decisions worth knowing:

- **Plan limits are data, enforced in the database.** `plan_limits` holds them
  (Free: 1 resume, 10 AI generations, 3 PDFs, no DOCX, 3 imports).
  `consume_quota(kind)` spends one unit in a single conditional `UPDATE`, so two
  parallel clicks can't both take the last unit. Resume count is enforced by a
  trigger with an advisory lock. `refund_quota` is service-role only.
- **Users can't touch billing columns.** `profiles.plan` and
  `stripe_customer_id` have no update grant for users; only the Stripe webhook
  writes them.
- **Cross-user links are impossible.** Every child row carries `user_id` and a
  composite foreign key `(resume_id, user_id)` to `resumes (id, user_id)`, so a
  user can't attach a row to someone else's resume, even with RLS satisfied.
  The same goes for folders.
- **Autosave uses optimistic concurrency.** `resumes.revision` must match on
  write, so two tabs can't silently overwrite each other.
- **Re-exporting is free.** `exports` is unique on `(resume_id, format,
  revision)`: downloading the same unchanged resume again doesn't spend a
  download.
- **Deleting the auth user cascades everything.** Storage files and the
  Stripe customer are removed by the delete-account route.

`supabase/schema.test.mjs` applies the migrations to an in-memory Postgres (PGlite)
and checks 22 rules: RLS between two users, quotas, refunds, column grants,
folder ownership, cascades. **22 of 22 pass.**

## API

Route handlers under `app/api`. All require a signed-in user unless marked.
"Owner" means RLS limits it to the user's own rows. AI routes call
`consume_quota('ai_generation')` before the model and refund it on failure.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/resumes | create a resume (quota: resume count) | user | `{name, experienceLevel, language, target?: {title, company, description}}` | `{id}` | F01 |
| GET /api/resumes | list for the dashboard, no content | user | `?sort=created\|updated\|name&folder=` | `{resumes: [{id, name, folderId, lastScore, updatedAt}]}` | F08 |
| GET /api/resumes/:id | one resume + target job | owner | — | `{resume, target}` | F01 |
| PATCH /api/resumes/:id | autosave content, settings, template or name | owner | `{revision, content?, settings?, templateId?, name?, folderId?, lastScore?}` | `{revision}` or 409 with the server copy | F01 F05 |
| POST /api/resumes/:id/duplicate | copy, to tailor for another job (quota: resume count) | owner | `{name?}` | `{id}` | F08 |
| DELETE /api/resumes/:id | delete with versions, target, exports | owner | — | 204 | F08 |
| POST /api/folders | create a folder | user | `{name}` | `{id}` | F08 |
| PATCH /api/folders/:id | rename, reorder, collapse | owner | `{name?, position?, collapsed?}` | 200 | F08 |
| DELETE /api/folders/:id | delete; its resumes stay | owner | — | 204 | F08 |
| GET /api/resumes/:id/versions | version history list | owner | — | `[{id, revision, reason, createdAt}]` | F01 |
| POST /api/resumes/:id/versions/:vid/restore | restore (snapshots the current one first) | owner | `{revision}` | `{revision}` | F01 |
| PUT /api/resumes/:id/target | set or replace the job ad, extract keywords (free, rate-limited) | owner | `{title, company?, description}` | `{keywords}` | F03 |
| DELETE /api/resumes/:id/target | remove targeting | owner | — | 204 | F03 |
| POST /api/resumes/:id/target/dismiss | "No, not relevant" for a keyword | owner | `{term}` | 200 | F03 |
| POST /api/ai/bullet | suggest, complete, quantify or rewrite a bullet (JSON, not streamed: the fact guard needs the whole answer) | owner | `{resumeId, entryId, bulletId?, text, mode}` | `{text, placeholders, model, creditsLeft}` | F01 F04 |
| POST /api/ai/summary | write a summary from position and skills (streams) | owner | `{resumeId, position, skills}` | text stream | F01 |
| POST /api/ai/keyword-bullet | write one bullet using a missing keyword, picking the best role | owner | `{resumeId, term, entryId?}` | `{entryId, text, placeholders}` | F03 |
| POST /api/ai/skills | suggest skills for a category (could) | owner | `{resumeId, category, description}` | `{skills[]}` | F01 |
| POST /api/imports | register an upload and get a signed upload URL (quota: import) | user | `{fileName, mimeType, sizeBytes}` | `{importId, uploadUrl}` | F02 |
| POST /api/imports/:id/parse | extract text, map to the document, create the resume | owner | `{name, experienceLevel}` | `{resumeId}` or `{error: 'no_text' \| 'too_long' \| ...}` | F02 |
| POST /api/exports | render PDF or DOCX (quota unless this revision was exported before) | owner | `{resumeId, format, revision}` | the file (`application/pdf` or `.docx`) | F01 |
| POST /api/billing/checkout | start Stripe Checkout | user | `{plan: 'month' \| 'quarter' \| 'lifetime'}` | `{url}` | F06 |
| POST /api/billing/portal | open the Stripe Customer Portal | user | — | `{url}` | F09 |
| POST /api/webhooks/stripe | sync subscriptions and plan | Stripe (signature) | Stripe event | 200 | F06 F09 |
| GET /api/me | profile, plan, usage and limits for the sidebar meter | user | — | `{profile, plan, usage: {kind: {used, max}}}` | F01 |
| PATCH /api/me | name, app language, theme, onboarding answers | user | `{fullName?, appLanguage?, theme?, onboarding?}` | profile | F01 |
| DELETE /api/me | delete the account: Stripe, storage, then the auth user | user | `{confirmEmail}` | 204 | — |
| POST /api/tools/ats-check | anonymous score of an uploaded resume (could) | **anyone**, rate-limited by IP | multipart file + optional JD | `{score, categories, checks}` | F07 |
| GET /auth/callback | finish OAuth and email-link sign-in | Supabase | `code` | redirect to `/app` | F01 |

App pages: `/`, `/pricing`, `/templates`, `/tools/ats-checker` (S01-S04);
`/signup`, `/login`, `/forgot-password`, `/reset-password` (S05-S06); `/app`
(S11, onboarding S07-S08 as a dialog); `/app/resume/[id]/[tab]` where tab is
`contact | experience | education | skills | summary | <section type> | finish`
(S18-S29; **an unknown tab redirects once to `contact`**, never in a loop);
`/app/settings/[tab]` (S14-S15); upgrade dialog (S17).

The score is not an API: `lib/score` is a pure TypeScript module that runs in
the browser on every keystroke and on the server for the ATS checker.

**Webhooks in** (Stripe): `checkout.session.completed` (subscription or
lifetime), `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`, `charge.refunded` (refunded lifetime → free).
**Webhooks out**: none in this scope (Enterprise later).

**Jobs** (Vercel Cron, each a `GET /api/cron/<name>` checked against `CRON_SECRET`):

| job | schedule (UTC) | does |
| --- | --- | --- |
| prune-versions | daily 03:00 | keep the last 50 versions per resume, plus all from the last 7 days |
| cleanup-imports | hourly | delete uploaded files parsed or older than 24 hours (privacy) |
| reconcile-billing | daily 04:00 | compare subscriptions changed in Stripe in the last 48h with the database, fix drift from missed webhooks |
| prune-logs | weekly, Sunday 05:00 | delete `ai_generations` rows older than 180 days, old rate-limit windows, processed Stripe events and job runs |

Total: 29 routes + 4 cron routes.

## How the core parts work

**Live score (`lib/score`).** Pure functions over `ResumeContent` + target
keywords → `{total, categories[5], checks[]}`. Each check has an id, a
category, a severity (`error | warning | pass`), an optional `entryId`/`bulletId`,
a message, and a `tier` flag so any check can be made Pro-only later. The rules
come from recon.md's "scoring rules (observed)": punctuation, weak verbs,
pronouns, buzzwords, passive voice, filler words, wordy bullets, 3-6 bullets
per role, quantified bullets, page length, word count 400-800, keyword match,
application ready. The word lists are ours. **The Optimization category is
computed from the same keyword match the panel shows**, so it can't say 100
with keywords missing (Rezi bug, recon #3). Each check is unit-tested with
good and bad examples.

**Keywords.** `PUT /target` asks Sonnet once for structured keywords (term,
aliases, weight 1-3, kind) and stores them. Matching runs in the browser and is
deterministic: lower-case, strip punctuation, simple stemming, aliases
("JS" = "JavaScript"), word boundaries. The same function highlights matches
in the preview (S24).

**AI writing without invented facts** (recon #1, #2). Every prompt gets the
entry's real text and says: never add a number, duration, team size or result
the user didn't give; use `[number]` placeholders instead. A post-check
compares every number in the output with the user's own text and turns any new
one into a placeholder, shown highlighted until the user fills it in.
"Complete bullet" may rewrite the start of the bullet, so it can fix the weak
verb the checker flags.

**Preview and PDF.** Templates are React components rendering plain semantic
HTML with print CSS (one column, real text, no tables for layout). The
preview renders them in an iframe with page breaks. `POST /api/exports`
renders the same component to HTML and prints it with Chromium. Fonts are
self-hosted open fonts: Merriweather, Source Sans 3, Carlito (in place of
Calibri) and Tinos (in place of Times New Roman). "Auto-adjust" steps font
size and spacing down until the content fits whole pages.

**Import.** Upload goes straight to `imports/<user_id>/` with a signed URL.
The parse route extracts text, refuses scans (fewer than 200 characters of
text: "this looks like a scanned image"), asks Sonnet for a `ResumeContent`
object, validates it with zod, and creates the resume with `source = 'import'`.

## The parts that bite

- **Time zones:** resume dates are year + month only, so there are none in the
  content. Timestamps are `timestamptz`, stored in UTC. Monthly quotas roll
  over at midnight UTC on the 1st; the sidebar says so.
- **Idempotency:** Stripe sends webhooks more than once. `stripe_events` stores
  each event id, and handlers upsert by `stripe_subscription_id` /
  `stripe_checkout_session_id`. The reconcile job catches missed ones.
- **Races:** quotas use one conditional UPDATE; resume creation takes an
  advisory lock; autosave checks `revision` and returns 409 with the server
  copy so the editor can merge or ask. An AI suggestion is applied to the
  revision it was generated for, or re-anchored by bullet id.
- **Rate limits:** AI routes allow 20 calls per user per minute (count in
  `ai_generations`); keyword extraction 10 per hour; imports per quota.
  `/api/tools/ats-check` gets a Vercel Firewall rule (5 per IP per hour) and
  bot protection.
- **File limits:** 5 MB, PDF or DOCX only, checked by the bucket, by the
  database and by the file's first bytes on the server. Photos 2 MB,
  JPEG/PNG/WebP.
- **PDF on serverless:** Chromium is large and slow to start. Use the slim
  `@sparticuz/chromium` build, give the function more memory, and keep it warm
  if p95 is bad. Set a 60-second limit and return a friendly retry on timeout.
- **AI cost:** Haiku for the frequent inline calls, Sonnet for the rest, every
  call logged with tokens and cost. Pro has a 300-a-month fair-use cap, set in
  `plan_limits`, so it can change without a deploy.
- **Search, realtime, offline:** none needed. Autosave keeps unsaved edits in
  `localStorage` while offline and retries.
- **Email deliverability:** Resend with SPF, DKIM and DMARC on your domain
  (`/replica-deploy` writes the records).
- **Multi-tenancy:** single user per row now. Enterprise teams would add an
  `org_id` later.
- **GDPR deletion:** `DELETE /api/me` cancels Stripe, deletes the Stripe
  customer, empties the user's storage folders, then deletes the auth user,
  which cascades every table. AI logs hold no resume text. Uploaded files are
  gone within 24 hours.
- **Privacy:** the resume text goes to the AI provider through the gateway;
  the privacy policy must say so.

## Build order

**M1. Vertical slice: sign up → one resume → PDF.** Ugly is fine.
- Screens: S05, S06, S11 (list only), S12 (name + level), S18, S19 (no AI), S21, S22, S24 (preview), S29 (PDF only)
- Tables: profiles, plan_limits, usage_counters, resumes, exports
- Routes: auth callback, POST/GET/PATCH /api/resumes, POST /api/exports, GET /api/me
- Done when: a new user signs up with email, fills one job, downloads a PDF
  whose text can be selected, and the 4th download is refused.

**M2. Must-haves (27 rows in features.csv).**
- Editor: S20 education, entry reorder/collapse/delete, autosave toast, resume switcher, delete account, password reset, Google sign-in.
- Score: `lib/score` with all checks, the per-entry Improvements panel (S19), the score report (S25).
- Targeting: S12 target switch, S26 keyword panel; table target_jobs; routes PUT/DELETE target, dismiss, POST /api/ai/keyword-bullet.
- AI: POST /api/ai/bullet and /api/ai/summary with the placeholder guard; table ai_generations.
- Look: 3 of our own templates, S27 adjustments, S28 picker with format filters.
- Dashboard: S11 sort, grid/list, rename, duplicate, delete; the usage meter.

**M3. Should-haves (22 rows).**
- Billing first, since this is a product to sell: S17, Stripe Checkout (month, quarter, lifetime), Customer Portal, webhooks, reconcile job; tables subscriptions, stripe_events.
- Then: optional sections (S23), version history (resume_versions, prune job), Complete-with-numbers and Rewrite, Auto-adjust, saved/recent templates, photo and icons, view as pages, DOCX, import (imports table, bucket, cleanup job), folders, onboarding questions (S07-S08), app language and theme, Apple sign-in, the score histogram once there are real users.

**M4. Could-haves (17 rows), in this order:** the free ATS checker page
(S03, a growth channel), cover letters, job tracker, AI Skills Explorer, sample
library (our own), Drive export, the rest.

**M5. Fixes from `/replica-entrepreneur`**, added to `features.csv` with
`original = no` and built here. Candidates from the recon are already in the
design: no invented numbers, a consistent score, an unknown route that doesn't
loop, a working layout at every width, and re-downloads that don't cost a credit.
