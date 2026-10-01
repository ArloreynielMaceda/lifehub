/**
 * Where sign-up confirmation links land. The page shows the outcome: "Email confirmed",
 * "confirmed, now sign in" (link opened in another browser) or "link expired".
 */
export const VERIFY_EMAIL_PATH = "/verify-email";

export type VerifyEmailStatus = "confirmed" | "expired";

/** Supabase lets each address request a confirmation email about once a minute. */
export const RESEND_COOLDOWN_SECONDS = 60;
