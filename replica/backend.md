# Backend

Reads `replica/architecture.md`. Status on 2026-10-13: everything below is
built and tested on the local stand-ins. The pieces that need your accounts
(Supabase, Stripe, Resend, Google, the AI Gateway) switch on when their keys
are in `.env.local`, and **have not been run against the real services yet**,
because Claude doesn't create accounts or handle keys. The checks to run once
they're in are at the end of each section.

## How it switches on

`src/server/config.ts` decides, from the environment:

| piece | with keys | without keys (local development) |
| --- | --- | --- |
| database + sign-in | Supabase (`src/server/repo/supabase.ts`, `src/server/auth/supabase.ts`) | JSON file `.data/db.json` with the same rules (`src/server/repo/fake.ts`) |
| AI writer | AI Gateway: Haiku 4.5 inline, Sonnet 5.5 for the rest | deterministic demo writer |
| email | Resend | written to `.data/outbox.jsonl` |
| payments | Stripe (test keys until `/replica-deploy`) | upgrade dialog says payments are off |
| Google / Apple sign-in | when listed in `AUTH_OAUTH_PROVIDERS` | buttons hidden |

Every screen and route talks to the same interfaces (`Repo`, `AuthProvider`,
`BillingStore`, `Ops` in `src/server/repo/types.ts` and `src/server/auth/types.ts`),
so nothing else changes when a key is added.

## Your setup checklist (accounts and keys are yours to create)

Copy `.env.example` to `.env.local` and fill it in as you go.

1. **Supabase.** Create a project.
   - Put the URL, the anon key and the service role key in `.env.local`, and the Session pooler connection string in `DATABASE_URL`.
   - Run `npm run db:migrate`, then `npm run check:supabase` (18 checks, below).
   - Under Authentication → Sign In / Providers → Email:
     - turn on **Confirm email**;
     - set the minimum password length to 10;
     - keep **Secure email change** on.
   - Under Authentication → URL Configuration:
     - set the Site URL to `http://localhost:3000` (your domain later);
     - add `http://localhost:3000/**` to the redirect URLs.
   - Paste the three templates from `supabase/templates/` (see its README).
   - Development data: `npm run seed -- --supabase`.
2. **Resend.** Add your sending domain (it gives you the SPF, DKIM and DMARC records; `/replica-deploy` puts them in DNS).
   - Create an API key and set `RESEND_API_KEY` and `EMAIL_FROM`.
   - In Supabase → Authentication → Emails → SMTP, enter Resend's SMTP details, so sign-up and reset emails come from your domain. Supabase's built-in sender is rate-limited to a handful of emails an hour and is only for testing.
3. **Stripe, test mode.**
   - Create one product, "Pro", with three prices: monthly, every 3 months, and a one-off lifetime price. Put their ids in `STRIPE_PRICE_*`.
   - Add a webhook endpoint for `/api/webhooks/stripe` with the 7 events below. Locally, use `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and its `whsec_`.
   - In the Customer Portal settings:
     - allow cancelling, **at the end of the period**;
     - allow switching between the monthly and 3-month prices;
     - allow updating the payment method.
   - Optional: turn on Adaptive Pricing for local currencies.
4. **Google sign-in.** In Google Cloud, create an OAuth client (Web).
   - Use the scopes `openid`, `email` and `profile` only.
   - Set the redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Paste the client id and secret into Supabase → Providers → Google, then set `AUTH_OAUTH_PROVIDERS=google`.
5. **AI.** In Vercel → AI Gateway, create an API key and set `AI_GATEWAY_API_KEY`. On Vercel itself, the project's OIDC token is used instead.
6. **Secrets.** `PRINT_TOKEN_SECRET` and `CRON_SECRET` are long random strings (`openssl rand -hex 32`).

## Auth

- Email and password, with the email confirmed before the first sign-in.
  - Sign-up gives the same answer whether or not the address already has an account. An existing owner gets a "you already have an account" email instead, so sign-up can't be used to check who's registered.
- Every emailed link goes to `/auth/confirm?token_hash=…&type=…`:
  - confirming sign-up signs you in and goes to `/app`;
  - a reset link signs you in and goes to `/reset-password`;
  - a change-email link goes to `/app/settings`.
  - Token-hash links work on a different device from the one that asked for them. Links are single-use; reset links last 1 hour and the others 24.
- Password reset: setting the new password signs out every other session.
- Change email: nothing changes until the link is clicked. With Supabase's Secure email change, both addresses must confirm.
- Google and Apple: `/auth/oauth/<provider>` → provider → `/auth/callback` (PKCE code exchange). Apple needs an Apple Developer account; it's the same code path.
- Magic links aren't offered: the original doesn't have them (recon S05/S06).
- Sessions:
  - Cookies are httpOnly, `SameSite=Lax`, and `Secure` in production.
  - The browser never talks to Supabase directly; every call goes through our routes. That's what lets the Supabase cookies be httpOnly.
  - `src/proxy.ts` refreshes the access token before each page.
- **Sign out everywhere** is in Settings and ends every session, including this one.
- Account deletion (Settings, typed-email confirm) runs in this order:
  1. deletes the Stripe customer, which cancels its subscriptions;
  2. empties the user's storage folders;
  3. deletes the auth user, which cascades to every table.
  The walkthrough checks nothing is left.
- Roles and teams: none. The recon has one user per account; Enterprise teams are a could-have, and would add `org_id` and one `can(user, action, record)` function.

## Database

- **Migrations:**
  - `supabase/migrations/0001_init.sql` holds the schema from `/replica-architect`.
  - `0002_backend.sql` adds:
    - `record_export()`;
    - service-only `refund_quota_now()` and `sync_plan()`;
    - Stripe ids for refunds;
    - `rate_limits` and `hit_rate_limit()`;
    - `job_runs` (the dead-letter log);
    - the prune functions.
  - `npm run db:migrate` applies them in order, each in a transaction. It records them where the Supabase CLI does, so `supabase db push` also works later.
- **Access rules:** row level security on all 14 tables. User actions run on the signed-in user's client, so RLS applies, and every query also filters by `user_id`. The service role is used only for:
  - the Stripe webhook;
  - cron jobs;
  - refunds;
  - AI logs;
  - the print page, which is authorised by a 60-second signed token;
  - account deletion.
- **Tested with a second user, three ways:**
  - `npm run test:schema`: 44 checks on an in-memory Postgres, **44/44 pass**. They cover:
    - user B can't read, update, insert or attach to user A's rows;
    - quotas, refunds, plan sync, rate limits and prune jobs;
    - users can't call the service functions, write billing columns or subscriptions, or read rate limits.
  - `npm run walkthrough`: user B gets 404 from A's resume on GET, PATCH, DELETE, export and AI, and an empty list. **Passes.**
  - `npm run check:supabase`: the same rules over the real Supabase API with two throwaway users, plus storage folders. **Not run yet: needs your project.**
- **Seed:** `npm run seed` (local) or `npm run seed -- --supabase`. One made-up person (Jordan Lee), one resume and one job ad. It refuses to run against a production deployment.
- **Backups:** Supabase's daily backups come with the Pro plan, which keeps 7 days. The Free plan has none you can restore from. **Before launch:** move the project to Pro (or add point-in-time recovery), then check Database → Backups shows a backup from the last 24 hours. Not checked yet.

## Payments (Stripe)

- **Start:** `POST /api/billing/checkout {plan}` opens Stripe Checkout.
  - Subscription mode for `month` and `quarter`, payment mode for `lifetime`.
  - The user id goes in `client_reference_id` and in the subscription or payment metadata.
  - If you're already on a paid plan, it's refused and points to the portal instead, so nobody pays twice.
- **Change card or plan:** `POST /api/billing/portal` opens the Customer Portal.
- **Cancel in one click:** Settings → Cancel plan → confirm. It cancels at the period end, and **Keep my plan** undoes it (`POST /api/billing/cancel`). There are no card forms anywhere.
- **Webhook** (`/api/webhooks/stripe`):
  - The signature is checked against the raw body first.
  - The event id is stored in `stripe_events`; one already processed is skipped, and one that failed half-way runs again.
  - Every write is an upsert keyed by a Stripe id. Subscription events re-fetch the subscription from Stripe, so out-of-order events can't store stale state.
  - The plan is recomputed from all of the user's subscriptions by `sync_plan()`. The app reads the plan from the database, never from the client.
  - Events handled:
    - `checkout.session.completed`
    - `checkout.session.async_payment_succeeded`
    - `customer.subscription.created`, `.updated` and `.deleted`
    - `invoice.payment_failed` (sends one email per invoice; Pro stays on while Stripe retries)
    - `charge.refunded` (a full refund of a lifetime purchase drops to Free)
- **Reconcile job:** daily, it replays the last 48 hours of Stripe events through the same handler, which fixes anything a missed webhook left behind.
- **Tested:**
  - `npm test`: 12 handler tests (ordering, retries, half-failed events, cancel, past due, lifetime, refunds) plus 2 signature tests.
  - `npm run webhook:check`: 11 signed events through the real route on the dev server; the plan and the Settings page changed as expected. **11/11 pass.**
  - Checkout and the portal haven't been run: they need your test keys. Then run:
    - `stripe trigger checkout.session.completed`;
    - a test card checkout from the upgrade dialog;
    - cancel and undo in Settings.

## Email and jobs

- **Emails the app sends** (`src/server/email.ts`, `src/server/email-templates.ts`, all written fresh):
  - verify, account exists, reset and change email (these four only on the local stand-in; Supabase sends its own from `supabase/templates/`);
  - payment failed.
  - Each has a text version, one link, and no tracking.
  - Addresses and links never go into logs.
- **Jobs:** Vercel Cron in `vercel.ts`, each a `GET /api/cron/<name>` that needs `Authorization: Bearer $CRON_SECRET`.
  - Each run gets 3 attempts with backoff. A run that still fails is stored in `job_runs` as `dead` with its error (the dead-letter log) and tried again on the next schedule.
  - Times are UTC. Monthly quotas roll over at 00:00 UTC on the 1st.

| job | schedule (UTC) | does |
| --- | --- | --- |
| cleanup-imports | hourly | deletes uploaded files once parsed, or after 24 h. Import isn't built yet, so this has nothing to do |
| prune-versions | daily 03:00 | keeps 50 versions per resume plus the last 7 days. Version history isn't built yet |
| reconcile-billing | daily 04:00 | replays 48 h of Stripe events |
| prune-logs | Sunday 05:00 | deletes AI logs older than 180 days, rate-limit windows older than a day, processed Stripe events and job runs older than 90 days |

## AI

- **Routes:** `/api/ai/bullet` (Haiku 4.5), `/api/ai/summary` and `/api/ai/keyword-bullet` (Sonnet 5.5), plus job-ad keyword extraction (Sonnet 5.5, structured output, rule-based fallback). All go through the Vercel AI Gateway.
  - There's no Haiku 5.x on the gateway; the model ids can be changed in `AI_MODEL_FAST` and `AI_MODEL_STRONG`.
- **No invented facts:** every result goes through `guardFacts()`. Any number that isn't in the user's own resume text becomes `[number]`, which the editor highlights and the download warns about. 7 unit tests.
- **Credits:**
  - One credit per call, refunded if the call fails.
  - At most 20 calls a minute per user.
  - Keyword extraction is free but capped at 10 model calls an hour.
  - Each call is logged with its tokens, never the text.
- **Not streamed** (the architecture said streams): the guard needs the whole answer before the user sees it, and bullets are short.
- **Not run against a model yet.** Once `AI_GATEWAY_API_KEY` is set, try each AI button, and check the gateway dashboard shows the calls and their cost.

## Integrations

| integration | official API | scopes / access | review before launch | limits |
| --- | --- | --- | --- | --- |
| Supabase Auth + Postgres + Storage | supabase-js, `@supabase/ssr` | anon key (RLS) and service role (server only) | none | auth email limits apply until custom SMTP is set; set "emails per hour" after Resend |
| Google sign-in | OAuth 2.0 via Supabase | `openid email profile` only | Basic scopes need no security review. Brand verification of the consent screen (your name and logo, privacy policy URL, authorised domain) takes days, so start it as soon as the domain exists. A Supabase custom domain makes the consent screen show your domain | Google's defaults are ample for sign-in |
| Sign in with Apple | via Supabase | name, email | Apple Developer Program membership. If an iOS app ever offers Google sign-in, App Store rules require Apple sign-in too; account deletion is already in place | — |
| Stripe | Checkout, Billing, Customer Portal, webhooks | restricted key possible later | Account activation (business details) before live mode, in `/replica-deploy` | API rate limits are generous; the SDK retries twice |
| Resend | HTTP API + SMTP for Supabase | sending only | Domain verification (DNS) | per-second API limit on the default plan; one email per user action here |
| Vercel AI Gateway | AI SDK 7 `generateText` | gateway key or OIDC | none. Model providers' usage policies apply | per-model limits; cost tracked in the gateway |
| Google Drive export (could, not built) | Drive API | `drive.file` only (files the app creates). Check Google's current classification first: a sensitive scope needs Google's OAuth verification, **which takes weeks**, so apply when this is scheduled, not at launch | — | — |
| LinkedIn | none | — | Not used: LinkedIn's terms forbid scraping (recon). Import LinkedIn's own PDF export instead | — |

## Security checklist

- [x] **Secrets only in env vars.**
  - `.env*` is in `.gitignore`; only `.env.example` is committed.
  - After `npm run build`, the browser bundle contains none of the 10 secret names, the service role, or the server SDKs (checked by grep).
  - Every server module imports `server-only`.
- [x] **Input validated on the server on every route.**
  - zod on all JSON bodies, with length limits.
  - The GET routes under `/auth` check their query values by hand.
  - The webhook trusts only a verified signature; cron routes need the secret.
  - State-changing routes also check `Origin`.
- [x] **Authorisation on every read and write, tested with a second user** (three ways, above; the real-Supabase run is still to do).
- [x] **Rate limits on auth, sign-up and everything that sends email**, counted in Postgres:
  - login: 10 per address and 30 per IP per 15 min;
  - sign-up: 10 per IP and 3 per address an hour;
  - reset, resend and change email: 3–5 an hour;
  - checkout: 10 an hour;
  - AI: 20 a minute;
  - keyword extraction: 10 an hour.
  - Keys are HMAC hashes, so no emails or IPs are stored.
  - The walkthrough checks that the 11th wrong password is refused.
  - The SMS part of the checklist doesn't apply: no SMS.
- [x] **Webhooks verify signatures** (unit tests, and a wrong-secret request is refused in `webhook:check` and the walkthrough).
- [ ] **Uploads: size and type limits, separate bucket.** Import and photos aren't built yet. The buckets are already private with size and type limits (5 MB PDF/DOCX, 2 MB images) and per-user folder rules, and the cleanup job is ready. When import is built, also check the file's first bytes on the server.
- [x] **No user data in URLs or logs.**
  - Email-link tokens are one-time hashes.
  - Logs carry ids and kinds only.
  - The print link carries opaque ids in a 60-second signed token, fetched only by our own headless Chrome.
  - The dev reset link no longer goes to the server log.
- [x] **Dependencies audited.**
  - `npm audit --omit=dev`: 0 vulnerabilities, after moving `puppeteer-core` to 25.12.
  - Dev-only findings remain in eslint's dependency chain; fixing them would downgrade `eslint-config-next`.
- [x] **Privacy policy lists every processor:** Supabase, Vercel, Anthropic via the gateway, Stripe, Resend, Google and Apple. `/privacy` is a **draft for legal review**.

## Tests

| check | result |
| --- | --- |
| `npm run test:schema` (migrations, RLS, quotas, billing, jobs) | 44 / 44 |
| `npm test` (fact guard, Stripe events, signatures) | 19 / 19 |
| `npm run walkthrough` (sign-up by emailed link, editor, AI, PDF, quotas, second-user isolation, change email, reset password, rate limit, sign out everywhere, delete account, axe, 390 px) | 46 / 46 |
| `npm run webhook:check` (signed events through the real route) | 11 / 11 |
| `npm run lint`, `tsc`, `npm run build` | pass |
| `npm run check:supabase` | not run: needs your Supabase project |
| Stripe Checkout and portal, Google sign-in, Resend delivery, AI Gateway calls | not run: need your keys |

Next: `/replica-test`.
