import type { Email } from "./email";

// Our own wording for every email the app sends itself. Plain, short, one
// link each, with a text version. The product name is a placeholder until
// /replica-brand.

const PRODUCT = process.env.NEXT_PUBLIC_PRODUCT_NAME || "Resume Builder";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(heading: string, paras: string[], cta?: { label: string; href: string }, footer?: string) {
  const p = paras.map((x) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#2b2a33">${esc(x)}</p>`).join("");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#2b2a33;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px">${esc(cta.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#5d5b66">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(cta.href)}</span></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<p style="margin:0 0 24px;font-weight:700;font-size:16px;color:#2b2a33">${esc(PRODUCT)}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#2b2a33">${esc(heading)}</h1>${p}${button}
<p style="margin:24px 0 0;font-size:12px;color:#5d5b66">${esc(footer ?? "You're getting this because of an action on your account. If it wasn't you, you can ignore it.")}</p>
</div></body></html>`;
}

const text = (heading: string, paras: string[], link?: string) => [heading, "", ...paras, ...(link ? ["", link] : [])].join("\n");

export const emails = {
  verify(to: string, link: string): Email {
    const h = "Confirm your email";
    const b = ["Click the button to confirm this address and finish setting up your account. The link works for 24 hours."];
    return { to, tag: "verify", subject: `Confirm your email for ${PRODUCT}`, text: text(h, b, link), html: layout(h, b, { label: "Confirm email", href: link }) };
  },
  accountExists(to: string, loginLink: string, resetLink: string): Email {
    const h = "You already have an account";
    const b = [
      "Someone, probably you, tried to sign up with this email. You already have an account, so you can log in instead.",
      `Forgot the password? Reset it here: ${resetLink}`,
    ];
    return { to, tag: "account_exists", subject: `You already have a ${PRODUCT} account`, text: text(h, b, loginLink), html: layout(h, b, { label: "Log in", href: loginLink }) };
  },
  reset(to: string, link: string): Email {
    const h = "Choose a new password";
    const b = ["Click the button to choose a new password. The link works for an hour and only once."];
    return { to, tag: "reset", subject: `Reset your ${PRODUCT} password`, text: text(h, b, link), html: layout(h, b, { label: "Choose a new password", href: link }) };
  },
  changeEmail(to: string, link: string): Email {
    const h = "Confirm your new email";
    const b = ["Click the button to use this address for your account from now on. Until you do, your old address stays in place."];
    return { to, tag: "change_email", subject: `Confirm your new email for ${PRODUCT}`, text: text(h, b, link), html: layout(h, b, { label: "Confirm new email", href: link }) };
  },
  paymentFailed(to: string, link: string): Email {
    const h = "Your payment didn't go through";
    const b = [
      "We couldn't take this period's payment for your plan. Your card company may have declined it, or the card may have expired.",
      "Stripe will try again over the next few days, and you keep Pro in the meantime. To fix it now, update your card:",
    ];
    return { to, tag: "payment_failed", subject: `Payment problem with your ${PRODUCT} plan`, text: text(h, b, link), html: layout(h, b, { label: "Update card", href: link }, "You're getting this because you have a paid plan.") };
  },
};
