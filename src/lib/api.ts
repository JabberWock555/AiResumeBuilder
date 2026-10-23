// Tiny typed client for our own API routes.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public data: Record<string, unknown>,
  ) {
    super(code);
  }
  get isQuota() {
    return this.status === 402;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "error", data as Record<string, unknown>);
  return data as T;
}

/** Plain-language message for an API failure. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "not_authenticated":
        return "You've been signed out. Log in again to continue.";
      case "quota_exceeded":
        return "You've reached your plan's limit.";
      case "conflict":
        return "This resume changed somewhere else.";
      case "invalid_input":
        return "Some details need fixing.";
      case "rate_limited":
        return "Too many tries in a short time. Wait a few minutes and try again.";
      case "billing_off":
        return "Payments aren't switched on yet.";
      default:
        return "Something went wrong. Try again.";
    }
  }
  if (e instanceof TypeError) return "Can't reach the server. Check your connection.";
  return "Something went wrong. Try again.";
}
