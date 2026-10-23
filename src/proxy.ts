import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Runs before every page (not API routes or static files):
// - with Supabase, refreshes the session's access token and writes the new
//   cookies, since server components can't set cookies themselves;
// - sends signed-out visitors away from /app.
// This is an optimistic check only. Every page and API call checks the
// session again on the server.

const COOKIE_OPTIONS = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const protectedPath = request.nextUrl.pathname.startsWith("/app");

  let response = NextResponse.next({ request });
  let signedIn: boolean;

  if (url && key) {
    const sb = createServerClient(url, key, {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list, headers) {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, ...COOKIE_OPTIONS });
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
        },
      },
    });
    const { data } = await sb.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } else {
    signedIn = request.cookies.has("sid");
  }

  if (protectedPath && !signedIn) {
    const to = new URL("/login", request.url);
    to.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|auth|print|_next/static|_next/image|fonts|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico|woff2?)$).*)"],
};
