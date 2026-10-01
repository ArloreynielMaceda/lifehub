"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type ActionResult,
  GENERIC_ERROR,
  SESSION_EXPIRED,
  fail,
  ok,
  validationFailure,
} from "@/lib/action-result";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { type ActionContext, getActionContext, toUserError } from "@/lib/server-action";
import { type PasswordCheck, discardSession, verifyCurrentPassword } from "@/lib/supabase/reauth";

import { changePasswordSchema, deleteAccountSchema, preferencesSchema, profileSchema } from "./schemas";

const WRONG_PASSWORD = "That isn't your current password.";

/** Confirms the signed-in user's current password; maps failures to form errors. */
async function reauthenticate(
  ctx: ActionContext,
  password: string,
  field: "currentPassword" | "password",
): Promise<{ check: Extract<PasswordCheck, { ok: true }> } | { failure: ReturnType<typeof fail> }> {
  if (!ctx.email) return { failure: fail(GENERIC_ERROR) };
  const check = await verifyCurrentPassword(ctx.email, password);
  if (check.ok) return { check };
  if (check.reason === "wrong_password") return { failure: fail(WRONG_PASSWORD, { [field]: [WRONG_PASSWORD] }) };
  if (check.reason === "rate_limited") {
    return { failure: fail("Too many password attempts. Please wait a few minutes and try again.") };
  }
  return { failure: fail(GENERIC_ERROR) };
}

/**
 * Settings → Change password. Asks for the current password, then changes it through the
 * freshly verified session (so Supabase's "secure password change" setting is satisfied) and
 * signs out every other device. This browser continues on the new session.
 */
export async function changePassword(input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const result = await reauthenticate(ctx, parsed.data.currentPassword, "currentPassword");
  if ("failure" in result) return result.failure;
  const { client, session } = result.check;

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) {
    await discardSession(client);
    if (error.code === "same_password") {
      return fail("Choose a password you haven't used here before.", {
        password: ["New password must be different from the current one"],
      });
    }
    if (error.code === "weak_password") {
      return fail("Please choose a stronger password.", { password: ["This password is too weak or common"] });
    }
    return fail(toUserError("settings:change-password", error));
  }

  await client.auth.signOut({ scope: "others" }).catch(() => undefined);
  const { error: sessionError } = await ctx.supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (sessionError) {
    console.error("[settings:change-password] could not continue the session", { code: sessionError.code });
    redirect("/login?password_changed=1");
  }
  return ok(null, "Password changed. Other devices have been signed out.");
}

/** Ends every session for this account, on all devices, including this one. */
export async function signOutEverywhere(): Promise<void> {
  const ctx = await getActionContext();
  if (ctx) await ctx.supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
  redirect("/login?signed_out=everywhere");
}

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", ctx.userId);
  if (error) return fail(toUserError("settings:profile", error));

  revalidatePath("/", "layout");
  return ok(null, "Profile saved");
}

export async function updatePreferences(input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  // Changing the currency affects new entries only; existing transactions and bills keep the
  // currency they were recorded in.
  const { error } = await ctx.supabase
    .from("profiles")
    .update({
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      email_reminders: parsed.data.emailReminders,
    })
    .eq("id", ctx.userId);
  if (error) return fail(toUserError("settings:preferences", error));

  revalidatePath("/", "layout");
  return ok(null, "Preferences saved");
}

/**
 * Permanently deletes the account: the user's files are removed through the Storage API
 * first (Supabase does not allow deleting storage objects from SQL), then the auth user is
 * deleted, which cascades to every row they own.
 */
export async function deleteAccount(input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const reauth = await reauthenticate(ctx, parsed.data.password, "password");
  if ("failure" in reauth) return reauth.failure;
  await discardSession(reauth.check.client);

  const bucket = ctx.supabase.storage.from(DOCUMENTS_BUCKET);
  for (let round = 0; round < 20; round += 1) {
    const { data: objects, error } = await bucket.list(ctx.userId, { limit: 100 });
    if (error) {
      console.error("[settings] list files for deletion failed", { message: error.message });
      return fail("We couldn't remove your documents. Please try again.");
    }
    if (!objects || objects.length === 0) break;
    const { error: removeError } = await bucket.remove(objects.map((object) => `${ctx.userId}/${object.name}`));
    if (removeError) {
      console.error("[settings] remove files failed", { message: removeError.message });
      return fail("We couldn't remove your documents. Please try again.");
    }
  }

  const { error } = await ctx.supabase.rpc("delete_my_account");
  if (error) return fail(toUserError("settings:delete-account", error));

  await ctx.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/?account_deleted=1");
}
