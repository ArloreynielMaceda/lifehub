import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { VERIFY_EMAIL_PATH, type VerifyEmailStatus } from "@/features/auth/paths";
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

/** supabase-js error when a PKCE code is exchanged in a browser that didn't start the flow. */
const CODE_VERIFIER_MISSING = "pkce_code_verifier_not_found";

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Handles links from Supabase auth emails.
 * - `token_hash` + `type` (recommended email templates): verified server-side with verifyOtp,
 *   which also works when the link is opened on a different device.
 * - `code` (default PKCE templates): exchanged for a session in the same browser.
 *
 * Sign-up confirmations always end on the confirmation page, which tells the user what
 * happened instead of silently dropping them on the dashboard or the sign-in form.
 * Redirect targets are always same-origin relative paths.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/dashboard");
  const type = searchParams.get("type");
  const isSignup = next === VERIFY_EMAIL_PATH || type === "signup" || type === "email";

  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const confirmation = (status?: VerifyEmailStatus) =>
    go(status ? `${VERIFY_EMAIL_PATH}?status=${status}` : VERIFY_EMAIL_PATH);
  const failure = () => (isSignup ? confirmation("expired") : go("/login?error=link_invalid"));

  if (!isSupabaseConfigured()) return go("/login?error=not_configured");
  if (searchParams.get("error") || searchParams.get("error_code")) return failure();

  const supabase = await createClient();
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      if (type === "recovery") return go("/reset-password");
      return isSignup ? confirmation() : go(next);
    }
    console.error("[auth:confirm] verifyOtp failed", { code: error.code, status: error.status });
    return failure();
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return isSignup ? confirmation() : go(next);
    console.error("[auth:confirm] code exchange failed", { code: error.code, status: error.status });
    // Supabase only sends people here with a code after it has confirmed their address, so
    // the account is active; the session just can't be created in a different browser.
    if (isSignup && error.code === CODE_VERIFIER_MISSING) return confirmation("confirmed");
    return failure();
  }

  return failure();
}
