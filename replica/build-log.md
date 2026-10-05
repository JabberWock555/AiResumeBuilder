# Build log

Data layer: **fake** (`src/server/repo/fake.ts`, a local JSON file at
`.data/db.json`) behind the same interface Supabase will implement
(`src/server/repo/types.ts`). AI: **demo writer** (`src/lib/ai/demo.ts`),
deterministic, never invents facts. Both are swapped in `/replica-backend`.

Run it: `npm run seed -- --reset` (demo login is in `scripts/seed.mjs`),
`npm run dev`, then `npm run walkthrough` for the end-to-end check.

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| S01 landing | 2026-10-06 | done (placeholder copy) | real positioning and copy come from /replica-launch | — |
| S02 pricing | 2026-10-06 | partial | prices; plan structure only | — |
| S03 ATS checker | 2026-10-06 | stub | needs file import | — |
| S04 templates | 2026-10-06 | done | — | — |
| S05 sign up | 2026-10-06 | done | Google and Apple sign-in (need real auth) | — |
| S06 log in, forgot, reset | 2026-10-06 | done | reset email (link goes to the dev log) | — |
| S07-S09 onboarding | — | not built | should-have | — |
| S10 discount offer | — | won't build | no countdown timers by design | — |
| S11 dashboard | 2026-10-06 | done | folders, import by drop | live thumbnails needed a scaled page component |
| S12 create resume | 2026-10-06 | done | import, language | — |
| S13 account menu | 2026-10-06 | done | — | — |
| S14 settings | 2026-10-06 | partial | change email, notifications, matching (S15, S16) | — |
| S17 upgrade dialog | 2026-10-06 | partial | payments (says so in the dialog) | — |
| S18 contact | 2026-10-06 | done | — | country list from `Intl.DisplayNames` instead of a hand list |
| S19 experience | 2026-10-06 | done | mouse drag reorder | fast typing after Enter landed in the old bullet: fixed by rendering the new row synchronously |
| S20 education | 2026-10-06 | done | — | — |
| S21 skills | 2026-10-06 | done | AI Skills Explorer (could) | — |
| S22 summary | 2026-10-06 | done | real model | — |
| S23 optional sections | 2026-10-06 | partial | awards, publications, references, military | — |
| S24 finish and preview | 2026-10-06 | done | — | — |
| S25 score report | 2026-10-06 | done | comparison histogram (needs real users) | the score engine was the biggest single piece; ~13 checks, one source of truth for the keyword match |
| S26 keyword targeting | 2026-10-06 | done | AI keyword extraction (rule-based for now) | — |
| S27 adjustments | 2026-10-06 | partial | indent, text colour, photo, icons | auto-fit had to step and re-measure, not compute |
| S28 templates picker | 2026-10-06 | partial | format filters, saved/recent | — |
| S29 download | 2026-10-06 | done (PDF) | DOCX, Drive | the shared Chrome died once and kept failing: now relaunches on disconnect |
| S30-S35 phase 2 | 2026-10-06 | placeholders | cover letters, agent, jobs, interview, examples | — |
| S36 import | — | not built | should-have | — |

## Things that were bigger than they looked

- **Fonts.** `next/font/google` downloads fonts at build time; the download
  timed out here and broke every page. Switched to self-hosted fonts from npm
  (`@fontsource`), which also removes a build-time dependency on Google.
- **PDF export.** Works locally with the installed Chrome. On Vercel it needs
  `@sparticuz/chromium` (in `/replica-deploy`). The print page is authorised
  by a 60-second signed token, not the session cookie.
- **The score engine.** Rules are ours and are unit-testable pure functions in
  `src/lib/score/`. They aren't unit-tested yet; `/replica-test` adds that.

## Deliberate differences from Rezi

- AI output never adds a number, duration or result the user didn't give: it
  leaves a `[placeholder]`, flags it as an error, and the download warns about it.
- The job-match score and the keyword panel use the same matcher, so they can't disagree.
- Re-downloading an unchanged resume doesn't spend a download.
- An unknown editor URL redirects once, to Contact.
- No countdown timers, no scrambled "Pro" keywords, no auto-opening sales popups.
- Template thumbnails show your own resume, not a sample person.

## Checks (2026-10-06)

- `npm run walkthrough`: 24 of 24 pass (sign-up to PDF, quotas, keyboard select,
  axe on 13 screens, no console errors, no sideways scroll at 390px).
- `npm run lint`, `tsc`, `npm run build`, `npm run test:schema` (22/22): pass.
- Screenshots: `replica/clone-screens/` at 1440×900, and `-390` at 390×844.

Reference screenshot mapping for `/replica-diff`: P01 → S01, P02 → S02,
P03 → S03, P04 → S04, A01 → S05, A04 → S11, A05 → S12. The A* references are
from a ~1000px-wide Safari window with browser chrome, so compare layout, not size.
