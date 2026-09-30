"use server";

import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  SESSION_EXPIRED,
  fail,
  ok,
  validationFailure,
} from "@/lib/action-result";
import { isScheduledOn } from "@/lib/routines";
import { type ActionContext, getActionContext, getUserToday, toUserError } from "@/lib/server-action";
import { idSchema, isoDateSchema } from "@/lib/validation";

import { routineFormSchema, taskFormSchema, taskStatusSchema } from "./schemas";

function revalidateTaskViews() {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

function toRow(values: ReturnType<typeof taskFormSchema.parse>) {
  // user_id is intentionally absent: the database fills it from auth.uid().
  return {
    title: values.title,
    description: values.description,
    due_date: values.dueDate || null,
    priority: values.priority,
    status: values.status,
    category: values.category,
  };
}

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await ctx.supabase.from("tasks").insert(toRow(parsed.data)).select("id").single();
  if (error || !data) return fail(toUserError("tasks:create", error));

  revalidateTaskViews();
  return ok({ id: data.id }, "Task added");
}

export async function updateTask(id: unknown, input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("That task could not be found.");
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  // RLS limits the update to the caller's rows; zero rows means "not yours / not found".
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update(toRow(parsed.data))
    .eq("id", parsedId.data)
    .eq("kind", "task")
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("tasks:update", error));
  if (!data) return fail("That task could not be found.");

  if (parsed.data.status === "completed") await markSourceNotificationsRead(ctx, parsedId.data);
  revalidateTaskViews();
  return ok(null, "Task updated");
}

export async function setTaskStatus(id: unknown, status: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  const parsedStatus = taskStatusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) return fail("Invalid request.");

  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({ status: parsedStatus.data })
    .eq("id", parsedId.data)
    .eq("kind", "task")
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("tasks:status", error));
  if (!data) return fail("That task could not be found.");

  if (parsedStatus.data === "completed") await markSourceNotificationsRead(ctx, parsedId.data);
  revalidateTaskViews();
  return ok(null, parsedStatus.data === "completed" ? "Task completed" : "Task updated");
}

export async function deleteTask(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("That task could not be found.");

  // Deleting a routine also deletes its completion history (FK cascade).
  const { data, error } = await ctx.supabase
    .from("tasks")
    .delete()
    .eq("id", parsedId.data)
    .select("id, kind")
    .maybeSingle();
  if (error) return fail(toUserError("tasks:delete", error));
  if (!data) return fail("That task could not be found.");

  await ctx.supabase.from("notifications").delete().eq("source_id", parsedId.data);
  revalidateTaskViews();
  revalidatePath("/", "layout");
  return ok(null, data.kind === "routine" ? "Routine deleted" : "Task deleted");
}

async function markSourceNotificationsRead(
  ctx: NonNullable<Awaited<ReturnType<typeof getActionContext>>>,
  sourceId: string,
) {
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("source_id", sourceId)
    .is("read_at", null);
  if (error) console.error("[tasks] could not clear notifications", { code: error.code });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

const ROUTINE_NOT_FOUND = "That routine could not be found.";

function toRoutineRow(values: ReturnType<typeof routineFormSchema.parse>) {
  // kind and user_id are never taken from the client for updates; user_id always comes
  // from auth.uid() in the database.
  return {
    title: values.title,
    description: values.description,
    priority: values.priority,
    category: values.category,
    repeat_days: values.repeatDays,
    starts_on: values.startsOn,
    ends_on: values.endsOn || null,
    reminder_time: values.reminderTime || null,
  };
}

export async function createRoutine(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = routineFormSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({ kind: "routine", status: "pending", ...toRoutineRow(parsed.data) })
    .select("id")
    .single();
  if (error || !data) return fail(toUserError("routines:create", error));

  revalidateTaskViews();
  return ok({ id: data.id }, "Routine added");
}

export async function updateRoutine(id: unknown, input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail(ROUTINE_NOT_FOUND);
  const parsed = routineFormSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  // Completion history is kept as-is; only the schedule going forward changes.
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update(toRoutineRow(parsed.data))
    .eq("id", parsedId.data)
    .eq("kind", "routine")
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("routines:update", error));
  if (!data) return fail(ROUTINE_NOT_FOUND);

  revalidateTaskViews();
  revalidatePath("/", "layout");
  return ok(null, "Routine updated");
}

async function loadRoutine(ctx: ActionContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select("id, kind, repeat_days, starts_on, ends_on, paused_on")
    .eq("id", id)
    .eq("kind", "routine")
    .maybeSingle();
  if (error || !data || !data.repeat_days || !data.starts_on) return null;
  return {
    id: data.id,
    repeat_days: data.repeat_days,
    starts_on: data.starts_on,
    ends_on: data.ends_on,
    paused_on: data.paused_on,
  };
}

/**
 * Marks one date of a routine done or not done. Other dates are never touched. Marking done
 * is idempotent (unique per date + ON CONFLICT DO NOTHING); marking not done deletes just
 * that date's row.
 */
export async function setRoutineCompletion(
  id: unknown,
  date: unknown,
  done: unknown,
): Promise<ActionResult<{ date: string; done: boolean }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  const parsedDate = isoDateSchema.safeParse(date);
  if (!parsedId.success || !parsedDate.success || typeof done !== "boolean") return fail("Invalid request.");

  const routine = await loadRoutine(ctx, parsedId.data);
  if (!routine) return fail(ROUTINE_NOT_FOUND);

  const today = await getUserToday(ctx);
  if (parsedDate.data > today) return fail("You can only complete today or earlier days.");

  if (done) {
    if (!isScheduledOn(routine, parsedDate.data)) return fail("This routine isn't scheduled on that day.");
    const { error } = await ctx.supabase
      .from("task_completions")
      .upsert(
        { task_id: parsedId.data, occurred_on: parsedDate.data },
        { onConflict: "task_id,occurred_on", ignoreDuplicates: true },
      );
    if (error) return fail(toUserError("routines:complete", error));
    if (parsedDate.data === today) await markSourceNotificationsRead(ctx, parsedId.data);
  } else {
    const { error } = await ctx.supabase
      .from("task_completions")
      .delete()
      .eq("task_id", parsedId.data)
      .eq("occurred_on", parsedDate.data);
    if (error) return fail(toUserError("routines:uncomplete", error));
  }

  revalidateTaskViews();
  return ok({ date: parsedDate.data, done }, done ? "Marked done" : "Marked not done");
}

/** Pauses (from today) or resumes a routine. History is kept either way. */
export async function setRoutinePaused(id: unknown, paused: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success || typeof paused !== "boolean") return fail("Invalid request.");

  const today = paused ? await getUserToday(ctx) : null;
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({ paused_on: today })
    .eq("id", parsedId.data)
    .eq("kind", "routine")
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("routines:pause", error));
  if (!data) return fail(ROUTINE_NOT_FOUND);

  revalidateTaskViews();
  return ok(null, paused ? "Routine paused" : "Routine resumed");
}
