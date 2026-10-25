export class QuotaError extends Error {
  constructor(public kind: string) {
    super(`quota_exceeded:${kind}`);
  }
}
export class ConflictError extends Error {
  constructor(public current: unknown) {
    super("conflict");
  }
}
export class NotFoundError extends Error {
  constructor(what = "not_found") {
    super(what);
  }
}
export class AuthError extends Error {
  constructor() {
    super("not_authenticated");
  }
}
export class InputError extends Error {
  constructor(public issues: unknown) {
    super("invalid_input");
  }
}
export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("rate_limited");
  }
}
/** The email provider couldn't take the message; nothing was changed. */
export class EmailUnavailableError extends Error {
  constructor() {
    super("email_unavailable");
  }
}
