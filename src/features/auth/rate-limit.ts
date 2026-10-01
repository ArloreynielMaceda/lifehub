/**
 * Supabase Auth has several different limits that all answer HTTP 429. Each gets its own
 * message so people know how long to wait (and developers can tell them apart in logs).
 */

export interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

/** Supabase's per-address email cooldown: "…you can only request this after 42 seconds." */
function cooldownSeconds(error: AuthErrorLike): number | null {
  const match = error.message?.match(/after (\d+) seconds?/i);
  return match ? Number(match[1]) : null;
}

export function isRateLimited(error: AuthErrorLike): boolean {
  return (
    error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit"
  );
}

/** A user-facing message for a rate-limit error, or null when the error isn't one. */
export function rateLimitMessage(error: AuthErrorLike): string | null {
  if (!isRateLimited(error)) return null;

  const seconds = cooldownSeconds(error);
  if (seconds !== null) {
    return `Please wait ${seconds} second${seconds === 1 ? "" : "s"} before asking for another email.`;
  }
  if (error.code === "over_email_send_rate_limit") {
    // Project-wide hourly cap on auth emails (very low with Supabase's built-in sender).
    return "We can't send more emails right now because the hourly email limit was reached. Please try again later.";
  }
  return "Too many attempts. Please wait a few minutes and try again.";
}

/** Log line for rate limits: codes only, never emails or passwords. */
export function logRateLimit(scope: string, error: AuthErrorLike): void {
  const hint =
    error.code === "over_email_send_rate_limit" && cooldownSeconds(error) === null
      ? "hourly auth email limit reached (Supabase's built-in sender allows only a few per hour; configure custom SMTP)"
      : undefined;
  console.warn(`[auth:${scope}] rate limited`, { code: error.code, status: error.status, hint });
}
