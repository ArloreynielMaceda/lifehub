"use server";

import { redirect } from "next/navigation";

import {
  type ActionResult,
  GENERIC_ERROR,
  fail,
  ok,
  validationFailure,
} from "@/lib/action-result";
import { STALE_SESSION_MESSAGE, isRecentlyAuthenticated, lastAuthenticatedAt } from "@/lib/auth-recency";
import { isValidTimeZone } from "@/lib/dates";
import { safeNextPath } from "@/lib/safe-redirect";
import { getRequestOrigin } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { VERIFY_EMAIL_PATH } from "./paths";
import { type AuthErrorLike, logRateLimit, rateLimitMessage } from "./rate-limit";
import {
  emailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

const NOT_CONFIGURED = "LifeHub isn't connected to Supabase yet. See the README to finish setup.";

/** Supabase rate limits → a message that says how long to wait; logged with the code. */
function rateLimited(scope: string, error: AuthErrorLike) {
  const message = rateLimitMessage(error);
  if (!message) return null;
  logRateLimit(scope, error);
  return fail(message);
}

/**
 * Where links in auth emails point: /auth/confirm on the site the user is using right now
 * (so a deployed site never links to localhost). Supabase must list this origin under
 * Authentication → URL Configuration → Redirect URLs, otherwise it falls back to its Site URL.
 */
async function authLink(next: string): Promise<string> {
  return `${await getRequestOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`;
}

function logAuthError(scope: string, error: AuthErrorLike) {
  // Never log emails or passwords.
  console.error(`[auth:${scope}]`, { code: error.code, status: error.status });
}

export type SignInResult = ActionResult<null> & { unverified?: boolean };

export async function signIn(input: unknown): Promise<SignInResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ...fail("Your account isn't active yet. Open the confirmation link we emailed you, or send yourself a new one."), unverified: true };
    }
    const limited = rateLimited("sign-in", error);
    if (limited) return limited;
    if (error.code === "invalid_credentials" || error.status === 400) {
      return fail("That email and password don't match. Please try again.");
    }
    logAuthError("sign-in", error);
    return fail(GENERIC_ERROR);
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(
  input: unknown,
): Promise<ActionResult<{ needsVerification: boolean; email: string }>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const { fullName, email, password, timezone } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await authLink(VERIFY_EMAIL_PATH),
      data: {
        full_name: fullName,
        timezone: timezone && isValidTimeZone(timezone) ? timezone : undefined,
      },
    },
  });

  if (error) {
    const limited = rateLimited("sign-up", error);
    if (limited) return limited;
    if (error.code === "weak_password") {
      return fail("Please choose a stronger password.", { password: ["This password is too weak or common"] });
    }
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return fail("An account with this email already exists. Try signing in instead.");
    }
    if (error.code === "signup_disabled") return fail("New sign-ups are currently disabled.");
    logAuthError("sign-up", error);
    return fail(GENERIC_ERROR);
  }

  // Email confirmation disabled in Supabase → the user is signed in immediately.
  if (data.session) redirect("/dashboard");

  // With confirmation enabled Supabase returns the same response for new and existing
  // emails, which prevents account enumeration.
  return ok({ needsVerification: true, email });
}

export async function resendVerification(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a valid email address");

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: await authLink(VERIFY_EMAIL_PATH) },
  });
  if (error) {
    const limited = rateLimited("resend", error);
    if (limited) return limited;
    logAuthError("resend", error);
  }
  // Same response either way so the endpoint can't be used to probe accounts.
  return ok(null, "If that account needs confirming, a new link is on its way.");
}

/**
 * Lets the "Confirm your email" screen notice when the link was opened in another tab of the
 * same browser (which signs the user in there).
 */
export async function checkEmailConfirmed(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims?.sub);
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await authLink("/reset-password"),
  });
  if (error) {
    const limited = rateLimited("reset-request", error);
    if (limited) return limited;
    logAuthError("reset-request", error);
  }
  return ok(null, "If an account exists for that email, a reset link is on its way.");
}

/**
 * Sets a new password without the old one: only for the session opened by an emailed reset
 * link, or a sign-in moments ago. An older session (e.g. a device left signed in) must use
 * Settings → Change password, which asks for the current password.
 */
export async function updatePassword(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return fail("Your reset link has expired. Please request a new one.");
  }
  if (!isRecentlyAuthenticated(lastAuthenticatedAt(data.claims))) return fail(STALE_SESSION_MESSAGE);

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return fail("Choose a password you haven't used here before.", {
        password: ["New password must be different from the current one"],
      });
    }
    if (error.code === "weak_password") {
      return fail("Please choose a stronger password.", { password: ["This password is too weak or common"] });
    }
    if (error.code === "reauthentication_needed") {
      return fail("For security, please sign in again before changing your password.");
    }
    const limited = rateLimited("update-password", error);
    if (limited) return limited;
    logAuthError("update-password", error);
    return fail(GENERIC_ERROR);
  }
  return ok(null, "Your password has been updated.");
}

/** From a stale reset page: sign out here so a new reset link can be requested. */
export async function restartPasswordReset(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/forgot-password");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/login?signed_out=1");
}
