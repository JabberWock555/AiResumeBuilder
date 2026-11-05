@AGENTS.md

# AI Resume Builder

Next.js 16 app: a resume builder with a saved profile, job targeting, a live score, AI writing and PDF export. See `README.md` for the overview, and `replica/backend.md` for the current backend design. Not deployed yet.

## Commands

```bash
npm run dev              # uses .env.local if present, else local stand-ins
npm run lint
npx tsc --noEmit -p .
npm test                 # unit (vitest)
npm run test:schema      # all migrations on in-memory Postgres
npm run e2e              # Playwright; needs the local dev server below
npm run walkthrough      # scripted tour; also refreshes replica/clone-screens/
npm run e2e:live         # real Supabase; needs the plain dev server and the seeded demo user
npm run check:supabase   # access rules on the real project
npm run audit:prod       # production dependency audit
npm run db:migrate       # apply supabase/migrations via DATABASE_URL
npm run seed -- --reset  # local demo data (add DATA_BACKEND=local if Supabase keys are set)
```

`e2e` and `walkthrough` need the dev server on the local stand-ins, because they read emails from `.data/outbox.jsonl`. Use the `web-webhook-test` config in `.claude/launch.json`. Use `web` for real services, and `web-prod` to check a production build.

## How the code is organised

- **Interfaces first.** Screens and routes only use `repo`, `auth`, `billingStore` and `ops` from `src/server/repo/index.ts`. Types are in `src/server/repo/types.ts` and `src/server/auth/types.ts`.
- **`src/server/config.ts`** decides which services are on, from the environment. `src/proxy.ts` can't import it (server-only), so it repeats the backend check.
- **`src/lib/`** runs in the browser too. **`src/server/`** must import `server-only`.
- **The resume document** is defined once, in `src/lib/resume/schema.ts`. The saved profile has the same shape, and its id in AI routes is `"profile"` (`src/server/docs.ts`).
- **Billing logic** in `src/server/billing/events.ts` is pure and unit-tested; network calls go in `razorpay.ts`.

## Rules for changes

### Data layer

- **A change to the data layer goes in both implementations:** `src/server/repo/supabase.ts` and `src/server/repo/fake.ts`. The fake must enforce the same rules, including sessions. BUG-010 reached the real backend because it didn't.
- **Schema changes are a new numbered file** in `supabase/migrations/`. Never edit one that's been applied. Add tests to `supabase/schema.test.mjs`, then apply it to Supabase through `npm run db:migrate` or the connector, naming it after the file without its number (`0006_profile.sql` → `profile`).
- **Every table gets row level security.** Run the Supabase security advisor after schema changes.
- **Service-only SQL functions** must `revoke execute ... from public, anon, authenticated`: Supabase grants execute on new functions by default.
- **Anything a user could call with their own token is an API.** BUG-009 was a function that let users mark a download as already done. Ask what a user gains by calling it directly.
- **The service role is only for** verified payments, webhooks, cron jobs, refunds, AI logs, the print page and account deletion. Always filter by user id there.

### Routes

- Wrap handlers in `handle()`, call `assertSameOrigin(req)` on anything that changes state, and validate input with `body(req, schema)` (`src/server/http.ts`).
- Check the session with `requireUser()` (routes) or `requireUserPage()` (pages).
- Rate-limit anything that sends email or calls a paid service (`src/server/rate-limit.ts`).
- A user's own data goes through the session client. Another user's record must answer 404, never 403.

### Product behaviour to keep

- **AI output goes through `guardFacts()`** (`src/lib/ai/guard.ts`). Never let a number the user didn't give reach their resume.
- **The job-match score and keyword panel share one matcher** (`src/lib/score/keywords.ts`).
- **Re-downloading an unchanged revision is free.** Failed AI calls, exports and imports refund their quota.
- **Webhook handlers stay idempotent**, and the plan is only ever set by `sync_plan()`.
- **Uploads are never stored.** Check file type by first bytes (`sniff()` in `src/server/import.ts`).
- **No countdown timers or dark patterns.** Cancelling stays one click.

### UI

- Use the components in `src/components/ui/` and token classes only. Never hard-code colours.
- To change tokens, edit `replica/design/tokens.json` and run `npm run tokens`, which checks contrast. That script needs the `replica-design` skill installed.
- Dropdown layer is `z-55`: above dialogs, below toasts. Use it for anything that opens from inside a dialog.
- Copy is plain, specific and written fresh. Say what happened and what to do next.
- Every screen must pass axe and have no sideways scroll at 390 px.

### Clean room

Never copy code, assets or copy from the product in `replica/recon.md`. `replica/screens/` is git-ignored and must stay out of the repo, which is public.

## Next.js 16 specifics

- `proxy.ts`, not middleware. `cookies()`, `params` and `searchParams` are async.
- Use `PageProps<"/route">`, `LayoutProps` and `RouteContext<"/route">`. Run `npx next typegen` after adding routes if types are missing.
- `notFound()` from a layout is caught by `not-found.tsx` one segment up, not beside the layout (BUG-006).
- A bare `<script>` in the root layout logs a warning in development on not-found pages only. Keep the inline theme script: `next/script` would run it after first paint.

## Testing

- Write the failing test first, then fix. Log real bugs in `replica/bugs.md` with severity and the fixing commit.
- E2E selectors use roles and labels only. Add a case to `replica/test-plan.md` for each new flow.
- Unit tests on the fake must set `FAKE_DB_FILE`, or they overwrite local data.

Known test traps:

- Required fields have an asterisk in their accessible name, so match with `getByRole("textbox", { name: /^Job title/ })`.
- Filled entries start collapsed: their fields aren't there until opened.
- Clicks before hydration are lost. Wait for `networkidle` first, including before going offline.
- Restart the dev server between full e2e runs: the local sign-up rate limit lives in memory.
- Don't return a mock from `beforeEach(() => mock.mockReset())`: vitest calls a returned function as cleanup.
- Name Playwright fixture callbacks `provide`, not `use`, or the React hooks lint rule fails.

## Security and dependencies

- **Never commit** `.env*` (except `.env.example`) or real keys, and don't print key values. When adding a variable, add it to `.env.example` with no value.
- **Razorpay stays on test keys** until deployment.
- **The demo login in `scripts/seed.mjs` is public.** Never seed a production project.
- **Pin new packages** with `--save-exact` to a release at least two weeks old. Security fixes may be newer: note why in the commit.
- **Run `npm run audit:prod` before merging.** Check `npm audit fix` changes before committing them.

## Git and docs

- Work on a branch and commit in logical steps. Commit or push only when asked. End commit messages with the attribution line the session asks for.
- When something changes, update what it affects:
  - `replica/features.csv` for feature status;
  - `replica/backend.md` for backend behaviour;
  - `replica/test-plan.md` and `replica/bugs.md` for tests and bugs;
  - `.env.example` for variables;
  - `README.md` for setup or architecture.
- `replica/architecture.md` is the original plan. Where it says Stripe, read Razorpay.
