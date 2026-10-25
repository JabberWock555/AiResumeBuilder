# Test plan: resume builder (Rezi rebuild)

Build: `test/e2e` @ ac1b38f. Date: 2026-10-24.

**Result:**
- 54 / 54 e2e cases pass (final run, fresh server).
- Unit 23/23, schema 44/44, walkthrough 46/46, production dependency audit 0.
- 9 manual cases: 1 done (the dependency audit). 6 need your Stripe, Resend or Google keys; 2 (slow network, auto-fit) are for a later pass.
- Bugs: 8 found, 8 fixed (2 S1, 2 S2, 3 S3, 1 S4); see `bugs.md`.
Env: local dev server on the local stand-ins (JSON data layer, demo AI writer,
email to `.data/outbox.jsonl`), started with the local-only Stripe webhook
secret (`web-webhook-test` in `.claude/launch.json`). Chrome 1440×900; 390×844
where noted.

**Run it:**
```
npm run seed -- --reset
STRIPE_WEBHOOK_SECRET=whsec_local_webhook_check_only npm run dev
npm run e2e
```
Restart the dev server before a full run: the local rate limits live in memory,
and one run signs up about 60 accounts from one address.

**Every spec:**
- fails on any console error or 5xx response, except refusals the case asks for on purpose;
- runs an axe WCAG 2.2 AA scan on each screen it visits.

Selectors are roles and labels only.

**Other suites:**
- `npm test`: unit tests (fact guard, Stripe events, signatures).
- `npm run test:schema`: 44 database rules.
- `npm run walkthrough`: the long scripted tour and screenshots.
- `npm run webhook:check`: signed Stripe events.

**Columns:** auto = `e2e` (Playwright spec), `unit`, `schema`, or `manual`.
Results are from the final run.

F02 (import), F10 (human review) and the onboarding questions (S07-S09) aren't
built, so they have no cases yet. F11 is ours: account and security flows.

## F01 New user builds a first resume and exports it

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F01-H1 | happy | sign up → confirm by email link → create (name, level, job ad) → contact → one job → skills → AI summary → finish → Download PDF | real PDF (text layer, >20 KB); axe clean on S05 S11 S12 S18 S19 S24 | e2e | pass |
| F01-E1 | empty input | submit sign-up and create forms empty | each field says what's missing | e2e | pass |
| F01-E2 | very long input | 400 chars into Full name; 500-char resume name via API | field caps at 120; API answers 400, not 500 | e2e | pass |
| F01-E3 | emoji and accents | "Zoë Ångström-Núñez 🚀", "São Paulo", "Café ☕" in the name | saved, reloaded and listed unchanged | e2e | pass |
| F01-E4 | refresh mid-flow | type a job and bullet, wait for Saved, reload | everything still there | e2e | pass |
| F01-E5 | two tabs | edit the same resume in two tabs | second tab gets "This resume changed in another tab"; first tab's save kept | e2e | pass |
| F01-E6 | double click on submit | double-click Create resume | exactly one resume | e2e | pass |
| F01-E7 | back button mid-flow | contact (type, Saved) → experience → Back | contact shows the saved name | e2e | pass |
| F01-E8 | offline | go offline, type, come back online | "Not saved", then Saved; the server has the edit | e2e | pass |
| F01-E9 | offline, then tab closed | saves fail, close the tab, reopen | the edit is restored from this device and then saved | e2e | pass |
| F01-E10 | expired session | session cookie removed while editing | says you're signed out, keeps the edit | e2e | pass |
| F01-E11 | unknown route | /app/resume/:id/not-a-tab | one redirect to Contact, no loop | e2e | pass |
| F01-E12 | keyboard only | create a resume with Tab, Enter and type-ahead | lands in the editor | e2e | pass |
| F01-E13 | mobile width | dashboard, contact, experience, finish, settings at 390 px | no sideways scroll; axe clean | e2e | pass |
| F01-E14 | slow network | throttle to Slow 3G, type and download | Saving… then Saved; the download button shows progress | manual | not run (to check) |
| F01-E15 | time zones and DST | dates are year and month only; quotas roll at 00:00 UTC | nothing to shift; the month boundary is covered by schema tests | schema | pass |
| F01-E16 | screen reader labels | every control has a name (axe), status messages live | axe clean on every screen visited | e2e | pass |
| F01-N1 | quota | 3 PDFs of changed versions, a repeat of the last, then a 4th version | 200 200 200 200 402 | e2e | pass |
| F01-N2 | AI invents facts | AI suggest or complete on a bullet with no numbers | placeholders, never a new number | unit + walkthrough | pass |

## F03 Tailor a resume to a job

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F03-H1 | happy | Job match → "Yes, draft a bullet" → Add to resume | match count goes up; draft numbers are only the user's own | e2e | pass |
| F03-H2 | happy | resume without a job ad → Add a job ad → Check keywords | keyword card appears | e2e | pass |
| F03-E1 | dismiss | "No, not relevant", reload | keyword leaves the count and stays out | e2e | pass |
| F03-E2 | input bounds | 9-char ad, 25,000-char ad, emoji title | 400, 400, 200 | e2e | pass |
| F03-E3 | consistency | some keywords missing | Job match category < 100 (Rezi showed 100) | e2e | pass |
| F03-N1 | second user | user B: GET, PUT, DELETE the target, dismiss, keyword bullet on A's resume | all 404 | e2e | pass |

## F04 Raise the score

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F04-H1 | happy | fill contact and a quantified bullet | score goes up; S25 axe clean | e2e | pass |
| F04-E1 | weak bullet | "i was responsible for…" then a rewrite | flagged, then cleared | e2e | pass |

## F05 Change the look

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F05-H1 | happy | Modern template, A4, font size | saved and still selected after reload | e2e | pass |
| F05-E1 | keyboard | heading colour radios with Enter | selection changes | e2e | pass |
| F05-E2 | auto-fit | two-page resume → Fit to one page | fits on one page or stops at 9 pt | manual | not run (to check) |

## F06 Upgrade

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F06-H1 | limit | free user with 1 resume → New resume | upgrade dialog with the reason; honest that payments are off; Continue disabled | e2e | pass |
| F06-H2 | after payment | Stripe event: subscription created | more resumes allowed; Settings shows Pro, monthly, renewal date | e2e | pass |
| F06-N1 | billing off | POST /api/billing/checkout without keys | 503 billing_off, nothing half-created | e2e | pass |
| F06-N2 | forged webhook | unsigned, then wrongly signed event granting Pro | 400 both times; plan stays Free | e2e | pass |
| F06-N3 | card declined | Checkout with `4000 0000 0000 0002` | Stripe shows the decline; plan stays Free; no subscription row | manual | not run: needs Stripe test keys |
| F06-H3 | Checkout end to end | test card `4242 4242 4242 4242`, each plan | lands on Settings "Payment received", Pro within seconds | manual | not run: needs Stripe test keys |

## F07 Anonymous ATS check (page only; the checker is a could-have)

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F07-H1 | happy | open /tools/ats-checker | renders, axe clean | e2e | pass |
| F07-E1 | signed out | /, /pricing, /templates, /privacy | 200 and axe clean | e2e | pass |

## F08 Manage resumes

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F08-H1 | happy | Rename, Make a copy (opens it), Delete with confirm | names update; the copy is removed; one left | e2e | pass |
| F08-H2 | sort and view | sort by name, switch to List, reload | A, B, C order; List remembered | e2e | pass |
| F08-E1 | limit | free user: Make a copy | upgrade dialog | e2e | pass |
| F08-N1 | deleted record | delete, then open its editor URL, GET and export | "We can't find that resume" page; 404s | e2e | pass |
| F08-N2 | second user | user B lists, opens, PATCH, DELETE, copy, export, AI on A's resume | nothing visible; all 404; A's resume unchanged | e2e | pass |

## F09 Cancel or change billing

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F09-H1 | cancelled | Stripe: cancel_at_period_end | still Pro; "Cancelled. You keep Pro until…" | e2e | pass |
| F09-E1 | payment failed | Stripe: past_due + invoice.payment_failed twice | Pro kept, "Payment failed" badge, exactly one email | e2e | pass |
| F09-E2 | ended | Stripe: subscription deleted | Free plan; resumes kept | e2e | pass |
| F09-H2 | one-click cancel | Settings → Cancel plan → confirm, then Keep my plan | Stripe shows cancel_at_period_end true, then false | manual | not run: needs Stripe test keys |
| F09-H3 | portal | Manage billing → change card, switch to quarterly | portal opens; the webhook updates the plan | manual | not run: needs Stripe test keys |
| F09-E3 | idempotency | replay events, out of order, half-failed | one row per subscription; correct final plan | unit | pass (12 tests) |

## F11 Account and security (ours)

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F11-H1 | happy | log out from the account menu, log in | back in /app; S06 axe clean | e2e | pass |
| F11-H2 | reset | forgot → email link → new password | signed in here; other device signed out; old password 401, new 200 | e2e | pass |
| F11-H3 | change email | Settings → Change email → link | new email shown and logs in | e2e | pass |
| F11-H4 | sign out everywhere | second session open, click it | both signed out | e2e | pass |
| F11-H5 | delete account | typed confirm, delete | home page; login 401; nothing left in the data file | e2e | pass |
| F11-E1 | expired link | /reset-password with no session | "This link has expired" | e2e | pass |
| F11-N1 | wrong password | wrong password, unknown email | the same message for both | e2e | pass |
| F11-N2 | unverified | log in before confirming | "Check your email" with resend; resend sends one | e2e | pass |
| F11-N3 | taken email | sign up with an existing email | same 202; owner gets "you already have an account" | e2e | pass |
| F11-N4 | reused link | open the confirm link twice | second time: "expired or was already used" | e2e | pass |
| F11-N5 | email taken | change to another account's email | 409 | e2e | pass |
| F11-N6 | permission denied | signed out → /app/settings | login with next, then back to Settings | e2e | pass |
| F11-N7 | open redirect | /login?next=https://evil.example.com/app | lands on our /app | e2e | pass |
| F11-N8 | brute force | 11 wrong passwords for one address | 10 × 401 then 429 | e2e | pass |
| F11-N9 | CSRF | POST from another Origin | refused | e2e | pass |
| F11-N10 | email provider down | sign-up, reset, resend while sending fails; sign up again later | 503 "couldn't send the email", no half-made account; the retry gets a fresh link | unit | pass |
| F11-M4 | production build | `web-prod` launch config: sign up → outbox link → log out → log in | works the same as development | manual | pass (2026-10-25) |
| F11-M1 | emails arrive | Resend: sign-up, reset, change email reach a real inbox, not spam; links work on a phone | manual | not run: needs Resend + Supabase |
| F11-M2 | Google sign-in | Continue with Google → consent → /app; second time → straight in | manual | not run: needs the Google client |
| F11-M3 | dependency audit | `npm audit --omit=dev` | 0 vulnerabilities | manual | pass after BUG-002 |
