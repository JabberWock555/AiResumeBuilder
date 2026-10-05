import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie means no point rendering the app.
// The real check happens on the server for every page and API call.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sid")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
}

export const config = { matcher: ["/app/:path*"] };
