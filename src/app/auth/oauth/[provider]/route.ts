import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/repo";
import { appUrl } from "@/server/config";
import { limit, perIp } from "@/server/rate-limit";

// Starts "Continue with Google / Apple" and sends the browser to the provider.
export async function GET(req: NextRequest, ctx: RouteContext<"/auth/oauth/[provider]">) {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "apple") return NextResponse.redirect(new URL("/login", req.url));
  try {
    await limit(perIp("oauth", req, 30, 600));
    const url = await auth.oauthStart(provider, appUrl(req));
    return NextResponse.redirect(url ?? new URL("/login?error=provider", req.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth", req.url));
  }
}
