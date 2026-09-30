"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, SESSION_EXPIRED, fail, ok } from "@/lib/action-result";
import { getActionContext, toUserError } from "@/lib/server-action";

const idSchema = z.uuid();

export async function markNotificationRead(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("Invalid notification.");

  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("read_at", null);
  if (error) return fail(toUserError("notifications:read", error));
  revalidatePath("/", "layout");
  return ok(null);
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) return fail(toUserError("notifications:read-all", error));
  revalidatePath("/", "layout");
  return ok(null, "All caught up");
}

export async function deleteNotification(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("Invalid notification.");
  const { error } = await ctx.supabase.from("notifications").delete().eq("id", parsed.data);
  if (error) return fail(toUserError("notifications:delete", error));
  revalidatePath("/", "layout");
  return ok(null);
}
