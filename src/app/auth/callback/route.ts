import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/repo";

// OAuth (Google, Apple) comes back here with a one-time code.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const ok = code && code.length < 200 ? await auth.exchangeCode(code) : false;
  return NextResponse.redirect(new URL(ok ? "/app" : "/login?error=oauth", req.url));
}
