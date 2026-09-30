"use server";

import { redirect } from "next/navigation";

import {
  type ActionResult,
  GENERIC_ERROR,
  fail,
  ok,
  validationFailure,
} from "@/lib/action-result";
import { isValidTimeZone } from "@/lib/dates";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import {
  emailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

const NOT_CONFIGURED = "LifeHub isn't connected to Supabase yet. See the README to finish setup.";
const RATE_LIMITED = "Too many attempts. Please wait a minute and try again.";

interface AuthErrorLike {
  code?: string;
  status?: number;
}

function isRateLimited(error: AuthErrorLike): boolean {
  return error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit";
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
      return { ...fail("Please confirm your email first. We can send a new link if you need one."), unverified: true };
    }
    if (isRateLimited(error)) return fail(RATE_LIMITED);
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
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=/dashboard`,
      data: {
        full_name: fullName,
        timezone: timezone && isValidTimeZone(timezone) ? timezone : undefined,
      },
    },
  });

  if (error) {
    if (isRateLimited(error)) return fail(RATE_LIMITED);
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
    options: { emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=/dashboard` },
  });
  if (error) {
    if (isRateLimited(error)) return fail(RATE_LIMITED);
    logAuthError("resend", error);
  }
  // Same response either way so the endpoint can't be used to probe accounts.
  return ok(null, "If that account needs confirming, a new link is on its way.");
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error) {
    if (isRateLimited(error)) return fail(RATE_LIMITED);
    logAuthError("reset-request", error);
  }
  return ok(null, "If an account exists for that email, a reset link is on its way.");
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return fail("Your reset link has expired. Please request a new one.");
  }

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
    if (isRateLimited(error)) return fail(RATE_LIMITED);
    logAuthError("update-password", error);
    return fail(GENERIC_ERROR);
  }
  return ok(null, "Your password has been updated.");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/login?signed_out=1");
}
