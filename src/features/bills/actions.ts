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
import { parseMoneyToMinor } from "@/lib/money";
import { nextOccurrenceAfter, type Recurrence } from "@/lib/recurrence";
import { type ActionContext, getActionContext, getUserToday, toUserError } from "@/lib/server-action";
import { idSchema, isoDateSchema } from "@/lib/validation";
import { PAYMENT_METHODS } from "@/features/transactions/constants";
import type { Enums } from "@/types/database";

import { billFormSchema } from "./schemas";

function revalidateBillViews() {
  revalidatePath("/bills");
  revalidatePath("/dashboard");
  revalidatePath("/expenses"); // paid bills are recorded as expenses
  revalidatePath("/", "layout"); // notification bell
}

/** Optional details when marking a bill paid (all default sensibly). */
const markPaidOptionsSchema = z
  .object({
    amount: z.string().trim().max(20).optional(),
    paidOn: isoDateSchema.optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    recordExpense: z.boolean().optional(),
  })
  .optional();

export type MarkPaidOptions = z.input<typeof markPaidOptionsSchema>;

async function profileCurrency(ctx: ActionContext): Promise<string> {
  const { data } = await ctx.supabase.from("profiles").select("currency").eq("id", ctx.userId).maybeSingle();
  return data?.currency ?? "PHP";
}

function amountToMinor(amount: string, currency: string): number | null {
  if (!amount) return null;
  const parsed = parseMoneyToMinor(amount, currency);
  return parsed.ok ? parsed.minor : null;
}

async function clearNotifications(ctx: ActionContext, billId: string) {
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("source_id", billId)
    .is("read_at", null);
  if (error) console.error("[bills] could not clear notifications", { code: error.code });
}

export async function createBill(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const currency = await profileCurrency(ctx);
  const parsed = billFormSchema(currency).safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const { data, error } = await ctx.supabase
    .from("bills")
    .insert({
      kind: values.kind,
      title: values.title,
      description: values.description,
      category: values.category,
      amount_minor: amountToMinor(values.amount, currency),
      currency,
      recurrence: values.recurrence,
      anchor_date: values.dueDate,
      next_due_date: values.dueDate,
    })
    .select("id")
    .single();
  if (error || !data) return fail(toUserError("bills:create", error));

  revalidateBillViews();
  return ok({ id: data.id }, values.kind === "bill" ? "Bill added" : "Reminder added");
}

export async function updateBill(id: unknown, input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("That item could not be found.");

  const { data: existing, error: loadError } = await ctx.supabase
    .from("bills")
    .select("id, currency, recurrence, anchor_date, next_due_date")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (loadError) return fail(toUserError("bills:load", loadError));
  if (!existing) return fail("That item could not be found.");

  // Amounts keep the bill's original currency.
  const parsed = billFormSchema(existing.currency).safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  // Changing the due date or the repeat rule re-anchors the schedule on the new date.
  const reanchor = values.dueDate !== existing.next_due_date || values.recurrence !== existing.recurrence;

  const { data, error } = await ctx.supabase
    .from("bills")
    .update({
      kind: values.kind,
      title: values.title,
      description: values.description,
      category: values.category,
      amount_minor: amountToMinor(values.amount, existing.currency),
      recurrence: values.recurrence,
      ...(reanchor ? { anchor_date: values.dueDate, next_due_date: values.dueDate } : {}),
    })
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("bills:update", error));
  if (!data) return fail("That item could not be found.");

  revalidateBillViews();
  return ok(null, "Saved");
}

export async function deleteBill(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("That item could not be found.");

  const { data, error } = await ctx.supabase
    .from("bills")
    .delete()
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("bills:delete", error));
  if (!data) return fail("That item could not be found.");

  await ctx.supabase.from("notifications").delete().eq("source_id", parsedId.data);
  revalidateBillViews();
  return ok(null, "Deleted");
}

export type MarkPaidResult = ActionResult<{
  outcome: "advanced" | "completed" | "unchanged";
  dueDate: string;
  nextDueDate: string | null;
  /** Minor units recorded as an expense, or null when nothing was added to spending. */
  expenseMinor: number | null;
}>;

type BillOutcome = Enums<"bill_outcome">;

async function recordOccurrence(
  id: unknown,
  dueDate: unknown,
  outcome: BillOutcome,
  rawOptions?: unknown,
): Promise<MarkPaidResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  const parsedDue = isoDateSchema.safeParse(dueDate);
  const parsedOptions = markPaidOptionsSchema.safeParse(rawOptions);
  if (!parsedId.success || !parsedDue.success || !parsedOptions.success) return fail("Invalid request.");
  const options = parsedOptions.data ?? {};

  const { data: bill, error: loadError } = await ctx.supabase
    .from("bills")
    .select("id, kind, recurrence, anchor_date, next_due_date, status, amount_minor, currency")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (loadError) return fail(toUserError("bills:load", loadError));
  if (!bill) return fail("That item could not be found.");

  // Amount actually paid: the one entered, else the bill's usual amount (bill's currency).
  let amountMinor: number | null = null;
  if (outcome === "done" && options.amount) {
    const parsedAmount = parseMoneyToMinor(options.amount, bill.currency);
    if (!parsedAmount.ok) return fail(parsedAmount.error, { amount: [parsedAmount.error] });
    amountMinor = parsedAmount.minor;
  }
  const effectiveAmount = amountMinor ?? bill.amount_minor;

  const today = await getUserToday(ctx);
  const paidOn = options.paidOn ?? today;
  if (paidOn > today) return fail("The payment date can't be in the future.", { paidOn: ["Choose today or an earlier date"] });

  const recordExpense = outcome === "done" && bill.kind === "bill" && options.recordExpense !== false;

  const next =
    bill.recurrence === "none"
      ? null
      : nextOccurrenceAfter(bill.anchor_date, bill.recurrence as Recurrence, parsedDue.data);

  const { data: result, error } = await ctx.supabase.rpc("mark_bill_occurrence", {
    p_bill_id: parsedId.data,
    p_due_date: parsedDue.data,
    p_next_due_date: next,
    p_outcome: outcome,
    p_amount_minor: amountMinor,
    p_paid_on: paidOn,
    p_payment_method: options.paymentMethod ?? "other",
    p_record_expense: recordExpense,
  });
  if (error) return fail(toUserError(`bills:${outcome === "done" ? "mark-paid" : "skip"}`, error));

  await clearNotifications(ctx, parsedId.data);
  revalidateBillViews();

  const status = (result ?? "unchanged") as "advanced" | "completed" | "unchanged";
  return ok(
    {
      outcome: status,
      dueDate: parsedDue.data,
      nextDueDate: next,
      expenseMinor: status !== "unchanged" && recordExpense && effectiveAmount !== null ? effectiveAmount : null,
    },
    status === "unchanged" ? "Already up to date" : undefined,
  );
}

/**
 * Marks the occurrence the user saw (`dueDate`) as paid/done. `dueDate` doubles as an
 * idempotency key: repeating the request (double click, network retry) changes nothing and
 * never creates a second expense. Bills with an amount are added to spending as one linked
 * expense unless `recordExpense` is false (e.g. the user already logged it by hand).
 */
export async function markBillPaid(id: unknown, dueDate: unknown, options?: unknown): Promise<MarkPaidResult> {
  return recordOccurrence(id, dueDate, "done", options);
}

/**
 * Skips the current occurrence (recurring) or cancels a one-time bill/reminder. No money is
 * recorded, history keeps the skip, and it can be undone like a payment.
 */
export async function skipBill(id: unknown, dueDate: unknown): Promise<MarkPaidResult> {
  return recordOccurrence(id, dueDate, "skipped");
}

/**
 * Undo from the History list: reverts a recorded payment/skip if it is the bill's most recent
 * one (the database compare-and-swap refuses anything older).
 */
export async function undoBillOccurrence(occurrenceId: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(occurrenceId);
  if (!parsedId.success) return fail("That record could not be found.");

  const { data: occurrence } = await ctx.supabase
    .from("bill_occurrences")
    .select("due_date, bills!inner(id, recurrence, anchor_date)")
    .eq("id", parsedId.data)
    .maybeSingle();
  const bill = Array.isArray(occurrence?.bills) ? occurrence?.bills[0] : occurrence?.bills;
  if (!occurrence || !bill) return fail("That record could not be found.");

  const expectedNext =
    bill.recurrence === "none"
      ? null
      : nextOccurrenceAfter(bill.anchor_date, bill.recurrence as Recurrence, occurrence.due_date);
  const { data, error } = await ctx.supabase.rpc("undo_bill_occurrence", {
    p_bill_id: bill.id,
    p_due_date: occurrence.due_date,
    p_expected_next_due_date: expectedNext,
  });
  if (error) return fail(toUserError("bills:undo", error));

  revalidateBillViews();
  if (data !== "reverted") return fail("Only the most recent payment of a bill can be undone.");
  return ok(null, "Undone — the bill is unpaid again");
}

/**
 * Reverts the payment or skip made by `markBillPaid`/`skipBill` if nothing has changed since.
 * Any expense the payment recorded is removed with it.
 */
export async function undoBillPaid(id: unknown, dueDate: unknown, expectedNext: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  const parsedDue = isoDateSchema.safeParse(dueDate);
  const parsedNext = isoDateSchema.nullable().safeParse(expectedNext ?? null);
  if (!parsedId.success || !parsedDue.success || !parsedNext.success) return fail("Invalid request.");

  const { data, error } = await ctx.supabase.rpc("undo_bill_occurrence", {
    p_bill_id: parsedId.data,
    p_due_date: parsedDue.data,
    p_expected_next_due_date: parsedNext.data,
  });
  if (error) return fail(toUserError("bills:undo", error));

  revalidateBillViews();
  if (data !== "reverted") return fail("This can no longer be undone.");
  return ok(null, "Undone");
}
