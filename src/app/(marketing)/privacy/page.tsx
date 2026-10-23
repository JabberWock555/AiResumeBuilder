import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

// DRAFT for legal review before launch (/replica-deploy checks it's up).
// It must list every company that processes users' data; keep the table in
// step with replica/backend.md when a service is added or removed.

const PROCESSORS = [
  ["Supabase", "Database, sign-in and file storage", "Your account, resumes, job ads you paste, uploaded files"],
  ["Vercel", "Hosting, scheduled jobs, AI Gateway", "Every request to the app; the text sent to the AI"],
  ["Anthropic (through the Vercel AI Gateway)", "Writing suggestions and job-ad keywords", "The resume text and job ad for that one request"],
  ["Stripe", "Payments", "Name, email, card details (we never see your card number), billing address"],
  ["Resend", "Sending email", "Your email address and the email we send you"],
  ["Google, Apple", "Sign-in, only if you choose it", "Your name and email from that account"],
];

export default function Privacy() {
  return (
    <article className="mx-auto flex max-w-(--layout-content-max) flex-col gap-6 px-4 py-12 text-base text-text md:px-6">
      <div>
        <h1 className="text-2xl">Privacy</h1>
        <p className="mt-2 text-sm text-text-muted">Draft. Last updated before launch.</p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">What we keep</h2>
        <p>Your account (name, email, password hash or the sign-in provider you used), your resumes, the job ads you paste, and how much of your plan you’ve used. Uploaded resume files are deleted within 24 hours of being read. Logs of AI requests keep the size and cost of each request, never the text, and are deleted after 180 days.</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Who processes it for us</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="py-2 pr-4 font-medium">What for</th>
                <th className="py-2 font-medium">What they see</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map(([who, why, what]) => (
                <tr key={who} className="border-b border-border align-top">
                  <td className="py-2 pr-4 font-medium">{who}</td>
                  <td className="py-2 pr-4">{why}</td>
                  <td className="py-2">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>We don’t sell your data, and we don’t use your resumes to train AI models. AI requests go through the Vercel AI Gateway to the model provider for that request only.</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Deleting your account</h2>
        <p>Settings → Delete account removes everything at once: your resumes, job ads, uploaded files and usage, and it cancels any subscription. Stripe keeps payment records it’s required to keep by law.</p>
      </section>
    </article>
  );
}
