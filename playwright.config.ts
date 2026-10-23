import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (e2e/), one spec per flow from replica/recon.md, against
// the local dev server on the local stand-ins (no Supabase/Stripe/Resend
// keys), so emails can be read from .data/outbox.jsonl.
// Uses the installed Chrome, so nothing extra is downloaded.
//
//   npm run dev       (or let Playwright start it)
//   npm run e2e
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: ".data/playwright-report" }]],
  outputDir: ".data/playwright-results",
  use: {
    baseURL: BASE,
    channel: "chrome",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: "npm run dev", url: BASE, reuseExistingServer: true, timeout: 120_000 },
});
