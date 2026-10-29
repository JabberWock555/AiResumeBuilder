# Bugs

From `/replica-test` on 2026-10-24, on branch `test/e2e`. Every bug here was
reproduced, and each fix landed with a test that failed before it and passes
after. Browser: Chrome, 1440×900 unless noted. Local stand-ins (no Supabase,
Razorpay or Resend keys).

| severity | found | fixed | open |
| --- | --- | --- | --- |
| S1 | 2 | 2 | 0 |
| S2 | 2 | 2 | 0 |
| S3 | 3 | 3 | 0 |
| S4 | 1 | 1 | 0 |

### BUG-001: dropdowns open behind dialogs, so a mouse user can't create a resume

- Severity: S1 (core flow blocked)
- Flow / case: F01 / F01-H1, F01-E6
- Screen: S12 (also any select, menu or date picker inside a dialog)
- Build: 91161ff. Browser: Chrome, 1440px; also reproduced by hand in the browser pane.

Steps
1. Dashboard → Create your first resume.
2. Click Experience level.

Expected: the list of levels opens and a click picks one.
Actual: nothing visible happens. The list opens behind the dialog's overlay, so the user can't pick a level and can't create the resume. Picking with the keyboard worked, invisibly, which is why the earlier walkthrough passed.
Evidence: F01-H1 and F01-E6 timed out with the dialog still open.
Suspected cause: menus, selects and popovers used z-30 and dialogs z-50. The design tokens had dropdown 30, modal 50.
Status: fixed in b279486. The dropdown layer is now 55 (above modal and sheet, below toast and tooltip), in `tokens.json` as well.

### BUG-002: production dependencies have critical security advisories

- Severity: S1 (security hole)
- Flow / case: F11 / F11-M3
- Build: 91161ff

Steps
1. `npm audit --omit=dev`

Expected: 0 vulnerabilities (it was 0 on 2026-10-13).
Actual: `next` 16.3.8 has two critical unauthenticated remote code execution advisories (image optimization with SVG; `use cache` returning typed arrays) and a high Server Actions DoS. `zod` 4.6.5, both ours and the copy puppeteer-core pulls in, has a high memory-exhaustion advisory. These were published after the backend pass.
Evidence: GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r, GHSA-mrhx-c7xc-m3w5.
Status: fixed in 4fce5fc: next 16.4.1, eslint-config-next 16.4.1, zod 4.6.6, puppeteer-core 25.13.0. `npm run audit:prod` finds 0. These releases are under two weeks old, an exception made for security fixes.

### BUG-003: Back shows a stale copy of the editor, then "Changed elsewhere"

- Severity: S3 (no data lost; reloading works around it)
- Flow / case: F01 / F01-E7
- Screen: S18
- Build: 91161ff

Steps
1. In Contact, type a full name and wait for Saved.
2. Go to Experience by a full page load.
3. Press Back.

Expected: Contact shows the saved name.
Actual: the fields are empty (the page as it first loaded). Typing then raises the "This resume changed in another tab" dialog. The revision check stops it from overwriting the saved name.
Evidence: F01-E7 got `""`. A probe showed the server still had the name and the status said "Changed elsewhere".
Suspected cause: editor pages were sent with `Cache-Control: no-cache, must-revalidate`, which Chrome may skip on back and forward. Next 16.4.1 sends `no-store` for dynamic pages.
Status: fixed in 4fce5fc by the Next.js upgrade. F01-E7 passes and stays as the regression test.

### BUG-004: closing the tab while saves are failing loses the unsaved edit

- Severity: S2 (the architecture promised edits survive being offline; once the tab is gone there's no way back)
- Flow / case: F01 / F01-E9
- Screen: S18–S22
- Build: 91161ff

Steps
1. Open the editor, then lose the connection: every save fails.
2. Type in City. The status says "Not saved".
3. Close the tab, ignoring the browser's leave-site warning, or let the browser crash.
4. Open the resume again.

Expected: the edit is still there and gets saved.
Actual: it's gone. It was only ever in the tab's memory.
Evidence: F01-E9: `Expected "Kept on this device", Received ""`.
Status: fixed in eb435ab. A failed save, or the tab going away with edits pending, writes them to this device's localStorage. When the editor next opens, it restores them and saves them, but only if the saved resume hasn't changed since; if it has, it says why it didn't.

### BUG-005: an expired session while editing just says "Not saved"

- Severity: S3 (logging in again and typing more saved it, if you guessed that)
- Flow / case: F01 / F01-E10
- Screen: S18–S22
- Build: 91161ff

Steps
1. Edit a resume.
2. The session ends (cookie gone or expired).
3. Type a change.

Expected: the user is told they've been signed out and how to save the edit.
Actual: the status shows "Not saved" with no reason. The edit retried only on the browser's "online" event, which never fires because the connection is fine.
Evidence: F01-E10 found no sign-out message.
Status: fixed in eb435ab. The status reads "Not saved: signed out", and a dialog offers "Log in again (new tab)" plus "I've logged in, save now". The editor also retries when the tab gets focus again. The test logs back in and checks the edit reaches the server.

### BUG-006: a deleted (or someone else's) resume link shows Next's bare 404

- Severity: S3 (visibly wrong; the only way back is the browser)
- Flow / case: F08 / F08-N1, F08-N2
- Screen: editor URL for a missing resume
- Build: 91161ff

Steps
1. Delete a resume, or as a second user, open `/app/resume/<id>/contact` for it.

Expected: "We can't find that resume" with a link back to the resumes.
Actual: Next's default "404 This page could not be found." The response was still a 404 and nothing leaked.
Suspected cause: `notFound()` is called from the editor layout, and Next catches a layout's not-found one segment up, so `[id]/not-found.tsx` was never used.
Status: fixed in f6d5f76 by moving it to `app/app/resume/not-found.tsx`. A production build (`web-prod` launch config, `next start`) shows the right page; the only console line is the 404 response itself.

### BUG-007: double gap in the editor's "Preview and download" button

- Severity: S4 (cosmetic)
- Screen: editor header, 640px and wider
- Build: 91161ff

Steps
1. Open any editor section at desktop width.

Expected: "Preview and download".
Actual: "Preview  and download", with a gap twice as wide. The button's flex gap fell between the two text pieces.
Evidence: `replica/clone-screens/S19-experience.png` before; a 1440px screenshot of the button after.
Status: fixed in ac1b38f. The label is one text span.

### BUG-008: if the confirmation email can't be sent, sign-up fails with a bare error and leaves an account that can never be confirmed

- Severity: S2 (sign-up broken while email is down; no way out for that address)
- Flow / case: F01 / F11; reported on 2026-10-25 by you, testing the `web-prod` build
- Screen: S05, then S06
- Build: production build of a2841b1 (`web-prod`: no Resend key)

Steps
1. Open the production build without an email provider (or with Resend failing).
2. Sign up.
3. Log in with the same details, or sign up again.

Expected: a clear "couldn't send the email, try again" message, with nothing half-made; once email works, signing up again sends the link.
Actual: sign-up answered 500 ("Something went wrong") but had already saved the account. Logging in said "Check your email" for a link that was never sent. Signing up again went down the "you already have an account" path, which also failed, so the address was stuck.
Evidence: server log `Error: email is not configured (RESEND_API_KEY, EMAIL_FROM)` at `signUp`; curl reproduced 500, then 403 `email_not_verified`, then 500.
Suspected cause: the account was written before the email was sent, and a failed send wasn't undone. Production also refuses the local outbox, correctly, and the `web-prod` config gave it no alternative.
Status: fixed in this commit:
- A failed send now undoes a new account and answers 503 `email_unavailable` ("We couldn't send the email just now. Nothing was changed").
- Reset, resend and change email give the same answer.
- Supabase's SMTP failures map to the same error.
- Signing up again before confirming sends a fresh confirmation link, as Supabase does, which also frees accounts already stuck.
- `EMAIL_OUTBOX=1` lets a local production build use the outbox; it's ignored on Vercel production. `web-prod` sets it.

Tests: `src/server/repo/fake-auth.test.ts` (4, failed before the fix). A production-build check signed up, confirmed, logged out and logged in.

## To check (not reproduced, or needs your keys)

- **Clicks before the page is interactive do nothing.** Seen in development right after a redirect, where hydration is slow: the first click on "Create your first resume" or the account menu was ignored. This is normal React behaviour. Measure the time until a page responds in the production build on a mid-range phone before calling it a bug.
- **Slow network (F01-E14), and auto-fit on a two-page resume (F05-E2):** not run yet.
- **Development-only warning:** Next prints "Encountered a script tag…" when it renders a not-found page from a layout in development. Not in the production build. F08-N1 allows it and says why.
- **Needs your keys (manual cases in `test-plan.md`):**
  - Razorpay Checkout, with a success and a failure test payment (F06-H3, F06-N3);
  - one-click cancel against Razorpay (F09-H2);
  - Resend emails arriving, not in spam, with links that work on a phone (F11-M1);
  - Google sign-in (F11-M2);
  - `npm run check:supabase` for the access rules on the real database.
- **Local rate limits are in memory.** Restart the dev server between full e2e runs. In production they're in Postgres.
