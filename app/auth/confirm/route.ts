import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

/**
 * Where a password link lands.
 *
 * An admin generates the link from Admin → Users and hands it over directly —
 * nothing is emailed. Opening it exchanges the one-time token for a session and
 * drops the person on /reset-password to choose a password.
 *
 * The token is single-use and expires; a stale or reused link fails closed and
 * sends them to the login screen with an explanation.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/reset-password";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/reset-password"}`);
}
