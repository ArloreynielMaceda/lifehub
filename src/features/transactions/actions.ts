"use server";

import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  SESSION_EXPIRED,
  fail,
  ok,
  validationFailure,
} from "@/lib/action-result";
import { parseMoneyToMinor } from "@/lib/money";
import { getActionContext, toUserError } from "@/lib/server-action";
import { idSchema } from "@/lib/validation";

import { transactionFormSchema } from "./schemas";

function revalidateMoneyViews() {
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}

const BILL_PAYMENT_LOCKED =
  "This expense is a bill payment. To change its amount, undo the payment in Bills and mark it paid again.";

function toMinor(amount: string, currency: string): number {
  const parsed = parseMoneyToMinor(amount, currency);
  if (!parsed.ok) throw new Error("amount already validated");
  return parsed.minor;
}

export async function createTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);

  // New transactions use the user's current preferred currency (read server-side).
  const { data: profile } = await ctx.supabase.from("profiles").select("currency").eq("id", ctx.userId).maybeSingle();
  const currency = profile?.currency ?? "PHP";

  const parsed = transactionFormSchema(currency).safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const { data, error } = await ctx.supabase
    .from("transactions")
    .insert({
      type: values.type,
      amount_minor: toMinor(values.amount, currency),
      currency,
      description: values.description,
      category: values.category,
      payment_method: values.paymentMethod,
      occurred_on: values.occurredOn,
    })
    .select("id")
    .single();
  if (error || !data) return fail(toUserError("transactions:create", error));

  revalidateMoneyViews();
  return ok({ id: data.id }, values.type === "income" ? "Income recorded" : "Expense recorded");
}

export async function updateTransaction(id: unknown, input: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("That transaction could not be found.");

  const { data: existing, error: loadError } = await ctx.supabase
    .from("transactions")
    .select("id, currency, type, amount_minor, bill_occurrence_id")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (loadError) return fail(toUserError("transactions:load", loadError));
  if (!existing) return fail("That transaction could not be found.");

  // Historical amounts keep their original currency.
  const parsed = transactionFormSchema(existing.currency).safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  // A bill payment's amount/type is owned by the bill (also enforced by a database trigger).
  if (
    existing.bill_occurrence_id &&
    (values.type !== existing.type || toMinor(values.amount, existing.currency) !== existing.amount_minor)
  ) {
    return fail(BILL_PAYMENT_LOCKED, { amount: ["Change this from Bills: undo the payment, then mark it paid again"] });
  }

  const { data, error } = await ctx.supabase
    .from("transactions")
    .update({
      type: values.type,
      amount_minor: toMinor(values.amount, existing.currency),
      description: values.description,
      category: values.category,
      payment_method: values.paymentMethod,
      occurred_on: values.occurredOn,
    })
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("transactions:update", error));
  if (!data) return fail("That transaction could not be found.");

  revalidateMoneyViews();
  return ok(null, "Transaction updated");
}

export async function deleteTransaction(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("That transaction could not be found.");

  // Bill payments are removed by undoing the payment in Bills, so the bill's status and
  // its expense never disagree.
  const { data: existing } = await ctx.supabase
    .from("transactions")
    .select("bill_occurrence_id")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (existing?.bill_occurrence_id) {
    return fail("This expense was recorded when you paid a bill. To remove it, undo the payment from Bills → History.");
  }

  const { data, error } = await ctx.supabase
    .from("transactions")
    .delete()
    .eq("id", parsedId.data)
    .is("bill_occurrence_id", null)
    .select("id")
    .maybeSingle();
  if (error) return fail(toUserError("transactions:delete", error));
  if (!data) return fail("That transaction could not be found.");

  revalidateMoneyViews();
  return ok(null, "Transaction deleted");
}
