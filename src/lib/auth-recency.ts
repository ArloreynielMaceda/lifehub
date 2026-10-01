/**
 * "Recently signed in" checks for sensitive actions that can't ask for the current password,
 * such as choosing a new password from an emailed reset link.
 */

/** How long after signing in (or opening a reset link) a password can be set without the old one. */
export const RECENT_AUTH_SECONDS = 15 * 60;

export const STALE_SESSION_MESSAGE =
  "For your security, open a new reset link to choose a password, or change it in Settings with your current password.";

interface AmrEntry {
  method?: unknown;
  timestamp?: unknown;
}

/**
 * When the session last proved who the user is (password, email link…), in Unix seconds,
 * from the JWT's `amr` claim. Token refreshes don't change it. Null when the claim is absent.
 */
export function lastAuthenticatedAt(claims: { amr?: unknown } | null | undefined): number | null {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return null;
  const times = (amr as AmrEntry[])
    .map((entry) => (typeof entry?.timestamp === "number" ? entry.timestamp : NaN))
    .filter((time) => Number.isFinite(time));
  return times.length ? Math.max(...times) : null;
}

/**
 * True when the user authenticated within the window. Without an `amr` claim (not issued by
 * Supabase Auth) this can't be judged, so it allows the action rather than locking people
 * out of password reset; Supabase always includes the claim.
 */
export function isRecentlyAuthenticated(
  authenticatedAt: number | null,
  nowSeconds = Math.floor(Date.now() / 1000),
  windowSeconds = RECENT_AUTH_SECONDS,
): boolean {
  if (authenticatedAt === null) return true;
  return nowSeconds - authenticatedAt <= windowSeconds;
}
