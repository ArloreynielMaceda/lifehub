import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/safe-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Handles links from Supabase auth emails.
 * - `token_hash` + `type` (recommended email templates): verified server-side with verifyOtp,
 *   which also works when the link is opened on a different device.
 * - `code` (default PKCE templates): exchanged for a session in the same browser.
 * Redirect targets are always same-origin relative paths.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/dashboard");
  const failure = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));

  if (!isSupabaseConfigured()) return failure("not_configured");
  if (searchParams.get("error") || searchParams.get("error_code")) return failure("link_invalid");

  const supabase = await createClient();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const destination = type === "recovery" ? "/reset-password" : next;
      return NextResponse.redirect(new URL(destination, request.url));
    }
    console.error("[auth:confirm] verifyOtp failed", { code: error.code, status: error.status });
    return failure("link_invalid");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("[auth:confirm] code exchange failed", { code: error.code, status: error.status });
    return failure("link_invalid");
  }

  return failure("link_invalid");
}
