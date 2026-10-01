import "server-only";

import { addDays, endOfMonth, startOfMonth, type ISODate } from "@/lib/dates";
import type { PlannedBill } from "@/lib/money-overview";
import { nextOccurrenceAfter, type Recurrence } from "@/lib/recurrence";
import { toSearchPattern } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { reportQueryError, throwQueryError } from "@/lib/schema-status";
import type { Bill } from "@/types/database";

import { BILL_PAGE_SIZE, UPCOMING_WINDOW_DAYS } from "./constants";
import type { BillFilters } from "./schemas";

export type BillItem = Pick<
  Bill,
  | "id"
  | "kind"
  | "title"
  | "description"
  | "category"
  | "amount_minor"
  | "currency"
  | "recurrence"
  | "anchor_date"
  | "next_due_date"
  | "status"
> & {
  /** Occurrence after the current one (recurring items only). */
  following_due_date: ISODate | null;
  last_completed_on: string | null;
  /** Outcome of the most recent occurrence (paid/done or skipped), if any. */
  last_outcome: "done" | "skipped" | null;
};

export interface BillHistoryItem {
  id: string;
  bill_id: string;
  due_date: string;
  amount_minor: number | null;
  currency: string;
  completed_at: string;
  outcome: "done" | "skipped";
  /** Date of the linked expense, when the payment was added to spending. */
  expense_date: string | null;
  title: string;
  kind: Bill["kind"];
  category: string;
}

const COLUMNS =
  "id, kind, title, description, category, amount_minor, currency, recurrence, anchor_date, next_due_date, status";

type BillRow = Omit<BillItem, "following_due_date" | "last_completed_on" | "last_outcome">;

async function withDerivedFields(rows: BillRow[]): Promise<BillItem[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bill_occurrences")
    .select("bill_id, completed_at, outcome")
    .in(
      "bill_id",
      rows.map((row) => row.id),
    )
    .order("completed_at", { ascending: false })
    .limit(rows.length * 3);
  reportQueryError("bills:last-outcome", error);
  const last = new Map<string, { completed_at: string; outcome: "done" | "skipped" }>();
  for (const row of data ?? []) if (!last.has(row.bill_id)) last.set(row.bill_id, row);

  return rows.map((row) => ({
    ...row,
    following_due_date:
      row.recurrence === "none" || row.status !== "active"
        ? null
        : nextOccurrenceAfter(row.anchor_date, row.recurrence as Recurrence, row.next_due_date),
    last_completed_on: last.get(row.id)?.completed_at ?? null,
    last_outcome: last.get(row.id)?.outcome ?? null,
  }));
}

export async function listBills(filters: BillFilters, today: ISODate, page: number) {
  const supabase = await createClient();
  let query = supabase.from("bills").select(COLUMNS, { count: "exact" });
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.q) query = query.ilike("search_text", toSearchPattern(filters.q));

  if (filters.view === "upcoming") {
    query = query.eq("status", "active").gte("next_due_date", today).order("next_due_date", { ascending: true });
  } else if (filters.view === "overdue") {
    query = query.eq("status", "active").lt("next_due_date", today).order("next_due_date", { ascending: true });
  } else {
    query = query.order("status", { ascending: true }).order("next_due_date", { ascending: true });
  }
  query = query.order("id", { ascending: true });

  const from = (page - 1) * BILL_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + BILL_PAGE_SIZE - 1);
  if (error) throwQueryError("bills:list", error, "Could not load bills");
  return { bills: await withDerivedFields((data ?? []) as BillRow[]), total: count ?? 0 };
}

export async function listBillHistory(filters: BillFilters, page: number) {
  const supabase = await createClient();
  let query = supabase
    .from("bill_occurrences")
    .select(
      "id, bill_id, due_date, amount_minor, currency, completed_at, outcome, bills!inner(title, kind, category, search_text), transactions(occurred_on)",
      { count: "exact" },
    )
    .order("completed_at", { ascending: false });
  if (filters.kind) query = query.eq("bills.kind", filters.kind);
  if (filters.q) query = query.ilike("bills.search_text", toSearchPattern(filters.q));

  const from = (page - 1) * BILL_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + BILL_PAGE_SIZE - 1);
  if (error) throwQueryError("bills:history", error, "Could not load payment history");
  const items: BillHistoryItem[] = (data ?? []).map((row) => {
    const bill = Array.isArray(row.bills) ? row.bills[0] : row.bills;
    const expense = Array.isArray(row.transactions) ? row.transactions[0] : row.transactions;
    return {
      id: row.id,
      bill_id: row.bill_id,
      due_date: row.due_date,
      amount_minor: row.amount_minor,
      currency: row.currency,
      completed_at: row.completed_at,
      outcome: row.outcome,
      expense_date: expense?.occurred_on ?? null,
      title: bill?.title ?? "Deleted item",
      kind: bill?.kind ?? "bill",
      category: bill?.category ?? "",
    };
  });
  return { items, total: count ?? 0 };
}

/** The earliest active bill or reminder (overdue ones come first), for the companion's nudge. */
export async function getNextDue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select("title, kind, next_due_date, amount_minor, currency")
    .eq("status", "active")
    .order("next_due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  reportQueryError("bills:next-due", error);
  return data ?? null;
}

export async function getBillOverview(today: ISODate) {
  const supabase = await createClient();
  const until = addDays(today, UPCOMING_WINDOW_DAYS);
  const monthStart = startOfMonth(today);
  const [summary, overdueAll, upcomingAll, paidThisMonth] = await Promise.all([
    supabase.rpc("bill_summary", { p_today: today, p_until: until }),
    supabase
      .from("bills")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lt("next_due_date", today),
    supabase
      .from("bills")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("next_due_date", today)
      .lte("next_due_date", until),
    supabase
      .from("bill_occurrences")
      .select("amount_minor, currency")
      .eq("outcome", "done")
      .gte("due_date", monthStart)
      .lte("due_date", endOfMonth(today))
      .limit(1000),
  ]);
  reportQueryError("bills:summary", summary.error);

  const paidTotals = new Map<string, number>();
  for (const row of paidThisMonth.data ?? []) {
    if (row.amount_minor) paidTotals.set(row.currency, (paidTotals.get(row.currency) ?? 0) + row.amount_minor);
  }

  return {
    byCurrency: summary.data ?? [],
    overdueCount: overdueAll.count ?? 0,
    upcomingCount: upcomingAll.count ?? 0,
    paidThisMonthCount: paidThisMonth.data?.length ?? 0,
    paidThisMonthTotals: [...paidTotals.entries()].map(([currency, total]) => ({ currency, total })),
  };
}

/**
 * Active bills with an amount that fall due on or before `until` (including overdue ones).
 * Used to project "after upcoming bills"; recurring occurrences are expanded in TS.
 */
export async function getPlannedBills(until: ISODate): Promise<PlannedBill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select("kind, status, amount_minor, currency, recurrence, anchor_date, next_due_date")
    .eq("status", "active")
    .eq("kind", "bill")
    .not("amount_minor", "is", null)
    .lte("next_due_date", until)
    .limit(500);
  reportQueryError("bills:planned", error);
  return (data ?? []) as PlannedBill[];
}

/** Active items due within `days` days, plus overdue ones (dashboard). */
export async function getDueSoon(today: ISODate, kind: Bill["kind"], limit = 5, days = 14) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select(COLUMNS)
    .eq("status", "active")
    .eq("kind", kind)
    .lte("next_due_date", addDays(today, days))
    .order("next_due_date", { ascending: true })
    .limit(limit);
  reportQueryError("bills:due-soon", error);
  return withDerivedFields((data ?? []) as BillRow[]);
}
