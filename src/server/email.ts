import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

// Transactional email through Resend's HTTP API, from your own domain
// (EMAIL_FROM, e.g. "Resume Builder <hello@mail.yourdomain.com>").
// Without a Resend key, emails go to .data/outbox.jsonl instead, so local
// sign-up and password reset still work and tests can read the links.
//
// Supabase Auth sends its own emails (verify, reset, change email) through
// Resend as its SMTP server; the templates for those are in supabase/templates.

export type Email = { to: string; subject: string; text: string; html: string; tag: string };

// EMAIL_OUTBOX=1 allows the outbox in a production build, for checking a
// build locally (`web-prod` launch config). Never on a Vercel production deploy.
const outboxAllowed = () =>
  process.env.NODE_ENV !== "production" || (process.env.EMAIL_OUTBOX === "1" && process.env.VERCEL_ENV !== "production");

export async function sendEmail(e: Email) {
  if (!config.email) {
    if (!outboxAllowed()) throw new Error("email is not configured (RESEND_API_KEY, EMAIL_FROM)");
    const file = path.join(process.cwd(), ".data", "outbox.jsonl");
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify({ ...e, sentAt: new Date().toISOString() }) + "\n");
    // Only the kind of email: addresses and links stay out of logs.
    console.info(`[email] "${e.tag}" written to .data/outbox.jsonl`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [e.to],
      subject: e.subject,
      text: e.text,
      html: e.html,
      tags: [{ name: "kind", value: e.tag }],
    }),
  });
  if (!res.ok) throw new Error(`email: Resend answered ${res.status}`);
}
