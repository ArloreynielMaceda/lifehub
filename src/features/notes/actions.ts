"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  type ActionResult,
  SESSION_EXPIRED,
  fail,
  ok,
  validationFailure,
} from "@/lib/action-result";
import { getActionContext, toUserError } from "@/lib/server-action";
import { idSchema } from "@/lib/validation";

import { noteContentSchema } from "./schemas";

export async function createNote(input: unknown): Promise<ActionResult<{ id: string; updatedAt: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = noteContentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await ctx.supabase
    .from("notes")
    .insert({ title: parsed.data.title.trim(), content: parsed.data.content })
    .select("id, updated_at")
    .single();
  if (error || !data) return fail(toUserError("notes:create", error));

  revalidatePath("/notes");
  return ok({ id: data.id, updatedAt: data.updated_at });
}

/**
 * Autosave target. Deliberately does not revalidate: the open editor owns its state and the
 * notes list is dynamic, so it is re-read on the next visit.
 */
export async function saveNote(id: unknown, input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("This note could not be found.");
  const parsed = noteContentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await ctx.supabase
    .from("notes")
    .update({ title: parsed.data.title.trim(), content: parsed.data.content })
    .eq("id", parsedId.data)
    .select("updated_at")
    .maybeSingle();
  if (error) return fail(toUserError("notes:save", error));
  if (!data) return fail("This note could not be found. It may have been deleted.");
  return ok({ updatedAt: data.updated_at });
}

export async function setNotePinned(id: unknown, pinned: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  const parsedPinned = z.boolean().safeParse(pinned);
  if (!parsedId.success || !parsedPinned.success) return fail("Invalid request.");

  const { data, error } = await ctx.supabase
    .from("notes")
    .update({ pinned: parsedPinned.data })
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("notes:pin", error));
  if (!data) return fail("This note could not be found.");

  revalidatePath("/notes");
  return ok(null, parsedPinned.data ? "Pinned" : "Unpinned");
}

export async function deleteNote(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("This note could not be found.");

  const { data, error } = await ctx.supabase
    .from("notes")
    .delete()
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("notes:delete", error));
  if (!data) return fail("This note could not be found.");

  revalidatePath("/notes");
  return ok(null, "Note deleted");
}
