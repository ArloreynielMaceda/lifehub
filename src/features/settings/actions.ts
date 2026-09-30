"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type ActionResult,
  SESSION_EXPIRED,
  fail,
  ok,
  validationFailure,
} from "@/lib/action-result";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { getActionContext, toUserError } from "@/lib/server-action";

import { deleteAccountSchema, preferencesSchema, profileSchema } from "./schemas";

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
