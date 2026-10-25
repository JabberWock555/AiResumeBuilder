import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// BUG-008: when the confirmation email can't be sent, sign-up must not leave
// a half-made account behind (one that can never be confirmed), and must say
// email is unavailable rather than fail with a bare 500.

const file = path.join(mkdtempSync(path.join(tmpdir(), "fake-auth-")), "db.json");
process.env.FAKE_DB_FILE = file;

const send = vi.fn();
vi.mock("../email", () => ({ sendEmail: (...a: unknown[]) => send(...a) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const { fakeAuth } = await import("./fake");
const { EmailUnavailableError } = await import("../errors");

const users = () => {
  try {
    return JSON.parse(readFileSync(file, "utf8")).users as { email: string }[];
  } catch {
    return [];
  }
};

describe("sign-up when email fails", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("rolls back the new account and reports email as unavailable", async () => {
    send.mockRejectedValueOnce(new Error("email: Resend answered 503"));
    const email = `fail-${Date.now()}@example.com`;
    await expect(fakeAuth.signUp({ email, password: "a-long-password", fullName: "Fail", origin: "http://x" })).rejects.toBeInstanceOf(EmailUnavailableError);
    expect(users().some((u) => u.email === email)).toBe(false);
  });

  it("lets the same person sign up once email works again", async () => {
    const email = `retry-${Date.now()}@example.com`;
    send.mockRejectedValueOnce(new Error("down"));
    await expect(fakeAuth.signUp({ email, password: "a-long-password", fullName: "Retry", origin: "http://x" })).rejects.toThrow();
    send.mockResolvedValueOnce(undefined);
    await expect(fakeAuth.signUp({ email, password: "a-long-password", fullName: "Retry", origin: "http://x" })).resolves.toBe("verify_email");
    expect(send.mock.calls.at(-1)?.[0].tag).toBe("verify");
    expect(users().filter((u) => u.email === email)).toHaveLength(1);
  });

  it("reports email as unavailable for reset and resend too, without changing anything", async () => {
    send.mockResolvedValueOnce(undefined);
    const email = `reset-${Date.now()}@example.com`;
    await fakeAuth.signUp({ email, password: "a-long-password", fullName: "Reset", origin: "http://x" });
    send.mockImplementation(async () => {
      throw new Error("down");
    });
    await expect(fakeAuth.sendPasswordReset(email, "http://x")).rejects.toBeInstanceOf(EmailUnavailableError);
    await expect(fakeAuth.resendVerification(email, "http://x")).rejects.toBeInstanceOf(EmailUnavailableError);
  });

  it("signing up again before confirming sends a fresh confirmation link, not 'account exists'", async () => {
    const email = `unconfirmed-${Date.now()}@example.com`;
    send.mockResolvedValue(undefined);
    await fakeAuth.signUp({ email, password: "a-long-password", fullName: "U", origin: "http://x" });
    await fakeAuth.signUp({ email, password: "a-long-password", fullName: "U", origin: "http://x" });
    expect(send.mock.calls.map((c) => c[0].tag)).toEqual(["verify", "verify"]);
  });
});
