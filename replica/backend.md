# Backend

Reads `replica/architecture.md`. Status on 2026-10-13: everything below is
built and tested on the local stand-ins. The pieces that need your accounts
(Supabase, Razorpay, Resend, Google, the AI Gateway) switch on when their keys
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
| payments | Razorpay (test keys until `/replica-deploy`) | upgrade dialog says payments are off |

`DATA_BACKEND=local` forces the local stand-ins even when the Supabase keys are set. The `web-webhook-test` launch config uses it, plus empty Razorpay keys, to run the e2e tests.
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
3. **Razorpay, test mode.** Keys go in `RAZORPAY_API_KEY` (the `rzp_test_…` key id) and `RAZORPAY_SECRET_KEY`.
   - Subscriptions → Plans: create a monthly plan (period monthly, interval 1) and a 3-monthly plan (period monthly, interval 3). Put their ids in `RAZORPAY_PLAN_MONTH` and `RAZORPAY_PLAN_QUARTER`.
   - Lifetime is a one-off order: set its price in paise in `RAZORPAY_LIFETIME_AMOUNT` (499900 = ₹4,999).
   - Account & Settings → Webhooks: URL `https://<your app>/api/webhooks/razorpay`, a secret you choose (the same value goes in `RAZORPAY_WEBHOOK_SECRET`), and the 12 events below.
   - Razorpay can't send webhooks to localhost. Locally the plan still switches on straight after payment (the checkout result is verified on our server). Renewals and cancellations need a tunnel: Razorpay's docs suggest `zrok`, since many tunnelling services are blocked.
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
  1. cancels every Razorpay subscription immediately (Razorpay has no API to delete a customer);
  2. empties the user's storage folders;
  3. deletes the auth user, which cascades to every table.
  The walkthrough checks nothing is left.
- Roles and teams: none. The recon has one user per account; Enterprise teams are a could-have, and would add `org_id` and one `can(user, action, record)` function.

## Database

- **Applied to Supabase** (project AiResumeBuilder, 2026-10-30) through the Supabase connector, as `init`, `backend`, `razorpay`, `hardening` and `export_server_only`. The direct `DATABASE_URL` host is IPv6-only and didn't resolve here. `npm run db:migrate` recognises migrations applied this way by name, and won't re-run them.
- **Supabase advisors:** after `0004_hardening`, the warnings left are deliberate:
  - three service-only tables have RLS with no policies;
  - `consume_quota` is callable by signed-in users (it only spends their own quota).
- **Migrations:**
  - `supabase/migrations/0001_init.sql` holds the schema from `/replica-architect`.
  - `0002_backend.sql` adds:
    - `record_export()`;
    - service-only `refund_quota_now()` and `sync_plan()`;
    - payment-provider ids for refunds (renamed to provider-neutral names in `0003_razorpay.sql`);
    - `rate_limits` and `hit_rate_limit()`;
    - `job_runs` (the dead-letter log);
    - the prune functions.
  - `npm run db:migrate` applies them in order, each in a transaction. It records them where the Supabase CLI does, so `supabase db push` also works later.
- **Access rules:** row level security on all 14 tables. User actions run on the signed-in user's client, so RLS applies, and every query also filters by `user_id`. The service role is used only for:
  - verified payments and the Razorpay webhook;
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
  - `npm run check:supabase`: the same rules over the real Supabase API with two throwaway users, plus storage folders. **19/19 pass on the real project (2026-10-30).**
  - `npm run e2e:live`: log in as the demo user, edit, autosave, reload, PDF and re-download, on the real project. **Passes.**
- **Seed:** `npm run seed` (local) or `npm run seed -- --supabase`. One made-up person (Jordan Lee), one resume and one job ad. It refuses to run against a production deployment.
- **Backups:** Supabase's daily backups come with the Pro plan, which keeps 7 days. The Free plan has none you can restore from. **Before launch:** move the project to Pro (or add point-in-time recovery), then check Database → Backups shows a backup from the last 24 hours. Not checked yet.

## Payments (Razorpay)

Switched from Stripe on 2026-10-30, at your request. `0003_razorpay.sql` renames the billing columns to provider-neutral names.

- **Paying:** `POST /api/billing/checkout {plan}` creates a Razorpay subscription (monthly or 3-monthly) or a one-off order (lifetime). The upgrade dialog then opens **Razorpay Checkout**, their modal for card, UPI and netbanking. No payment details touch our servers.
  - A user already on a paid plan is refused, so nobody pays twice.
  - Subscriptions run for 10 years of cycles (120 monthly or 40 quarterly), because Razorpay needs a fixed count.
- **Instant upgrade:** Checkout's success result goes to `POST /api/billing/verify`.
  - The server checks Razorpay's signature: HMAC of `payment_id|subscription_id`, or `order_id|payment_id` for orders, with the key secret.
  - It re-fetches the subscription or order and checks it belongs to this user.
  - Then it switches the plan on. Lifetime payments left "authorized" (manual capture) are captured here.
- **Cancel:** one click in Settings, at the end of the paid period (`POST /api/billing/cancel`). **Razorpay can't undo a cancellation**, so there's no "Keep my plan"; the dialog says you can subscribe again after it ends.
  - Razorpay has no customer portal. It emails receipts, and when a renewal fails it emails the customer a link to pay another way.
- **Webhook** (`/api/webhooks/razorpay`):
  - The `X-Razorpay-Signature` (HMAC-SHA256 of the raw body) is checked first.
  - `x-razorpay-event-id` goes into `billing_events`; an event already processed is skipped, and one that failed half-way runs again.
  - Subscription events re-fetch the subscription, so out-of-order events can't store stale state. The plan is recomputed by `sync_plan()`.
  - Events to tick in the dashboard:
    - `subscription.authenticated`, `.activated`, `.charged`, `.pending`, `.halted`, `.cancelled`, `.completed`, `.updated`, `.paused`, `.resumed`
    - `order.paid` (lifetime)
    - `refund.processed` (a full refund of a lifetime purchase drops to Free)
  - Statuses map like this:
    - `pending` (a renewal failed, Razorpay is retrying) keeps Pro and sends one email;
    - `halted` (retries ran out), `cancelled`, `completed` and `expired` go back to Free;
    - `created` and `authenticated` aren't Pro yet.
- **Reconcile job:** daily, it re-reads every open subscription from Razorpay. Razorpay has no "list recent events" API to replay.
- **Tested:**
  - `npm test`: 10 handler tests (statuses, idempotency, retries, out-of-order, cancel flag, lifetime and refunds) plus 2 signature tests.
  - e2e F06 and F09: signed Razorpay webhooks through the real route on the dev server; Settings shows each state.
  - **Not run against Razorpay yet:** the keys in `.env.local` are refused (401, see below).

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
| reconcile-billing | daily 04:00 | re-reads every open subscription from Razorpay |
| prune-logs | Sunday 05:00 | deletes AI logs older than 180 days, rate-limit windows older than a day, processed billing events and job runs older than 90 days |

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
| Razorpay | Orders, Subscriptions, Plans, Payments, Checkout.js, webhooks (`razorpay` SDK 2.9.8) | key id + secret, server only | Account activation (KYC: business and bank details) before live mode, in `/replica-deploy`. Subscriptions may need to be enabled on the account | per-key API rate limits; webhooks retried by Razorpay |
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
- [x] **Webhooks verify signatures** (unit tests; unsigned and wrongly signed requests are refused in e2e F06-N2 and the walkthrough).
- [ ] **Uploads: size and type limits, separate bucket.** Import and photos aren't built yet. The buckets are already private with size and type limits (5 MB PDF/DOCX, 2 MB images) and per-user folder rules, and the cleanup job is ready. When import is built, also check the file's first bytes on the server.
- [x] **No user data in URLs or logs.**
  - Email-link tokens are one-time hashes.
  - Logs carry ids and kinds only.
  - The print link carries opaque ids in a 60-second signed token, fetched only by our own headless Chrome.
  - The dev reset link no longer goes to the server log.
- [x] **Dependencies audited.**
  - `npm run audit:prod`: 0 vulnerabilities (2026-10-24, after Next.js 16.4.1, zod 4.6.6 and puppeteer-core 25.13.0 for new advisories; see `replica/bugs.md` BUG-002). Re-run before every deploy.
  - Dev-only findings remain in eslint's dependency chain; fixing them would downgrade `eslint-config-next`.
- [x] **Privacy policy lists every processor:** Supabase, Vercel, Anthropic via the gateway, Razorpay, Resend, Google and Apple. `/privacy` is a **draft for legal review**.

## Tests

| check | result |
| --- | --- |
| `npm run test:schema` (migrations, RLS, quotas, billing, jobs) | 44 / 44 |
| `npm test` (fact guard, Razorpay events, signatures, sign-up email failure) | 23 / 23 |
| `npm run walkthrough` (sign-up by emailed link, editor, AI, PDF, quotas, second-user isolation, change email, reset password, rate limit, sign out everywhere, delete account, axe, 390 px) | 46 / 46 |
| `npm run lint`, `tsc`, `npm run build` | pass |
| `npm run check:supabase` (real project) | 19 / 19 |
| `npm run e2e:live` (real project) | pass |
| Razorpay Checkout and cancel, Google sign-in, Resend delivery, AI Gateway calls | not run: need working keys |

Next: `/replica-test`.
