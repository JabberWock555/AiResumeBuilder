import "server-only";
import { z } from "zod";
import { AuthError, ConflictError, InputError, NotFoundError, QuotaError, RateLimitError } from "./errors";

/** Wraps a route handler: maps our errors to status codes and JSON bodies. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError) return Response.json({ error: "not_authenticated" }, { status: 401 });
      if (e instanceof QuotaError) return Response.json({ error: "quota_exceeded", kind: e.kind }, { status: 402 });
      if (e instanceof ConflictError) return Response.json({ error: "conflict", current: e.current }, { status: 409 });
      if (e instanceof NotFoundError) return Response.json({ error: e.message }, { status: 404 });
      if (e instanceof InputError) return Response.json({ error: "invalid_input", issues: e.issues }, { status: 400 });
      if (e instanceof RateLimitError)
        return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": String(e.retryAfterSeconds) } });
      console.error(e);
      return Response.json({ error: "server_error" }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new InputError("Body must be JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new InputError(z.flattenError(r.error));
  return r.data;
}

/** Same-origin check for state-changing requests (cookies are SameSite=Lax too). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new AuthError();
}
