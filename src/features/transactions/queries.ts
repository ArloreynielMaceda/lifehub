import "server-only";

import { getPlannedBills } from "@/features/bills/queries";
import { addMonthsClamped, endOfMonth, monthKey, startOfMonth, type ISODate } from "@/lib/dates";
import {
  buildMoneyOverview,
  unpaidBillsUntil,
  type MoneyOverview,
  type MoneySummaryRow,
} from "@/lib/money-overview";
import { toSearchPattern } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { reportQueryError, throwQueryError } from "@/lib/schema-status";
import type { Transaction } from "@/types/database";

import { MAX_CATEGORY_BARS, TRANSACTION_PAGE_SIZE, TREND_MONTHS } from "./constants";
import type { DateRange, TransactionFilters } from "./schemas";

export type TransactionItem = Pick<
  Transaction,
  | "id"
  | "type"
  | "amount_minor"
  | "currency"
  | "description"
  | "category"
  | "payment_method"
  | "occurred_on"
  | "bill_occurrence_id"
>;

const COLUMNS = "id, type, amount_minor, currency, description, category, payment_method, occurred_on, bill_occurrence_id";

export async function listTransactions(filters: TransactionFilters, range: DateRange, page: number) {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(COLUMNS, { count: "exact" })
    .gte("occurred_on", range.from)
    .lte("occurred_on", range.to);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.q) query = query.ilike("search_text", toSearchPattern(filters.q));

  const from = (page - 1) * TRANSACTION_PAGE_SIZE;
  const { data, count, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + TRANSACTION_PAGE_SIZE - 1);
  if (error) throwQueryError("transactions:list", error, "Could not load transactions");
  return { transactions: (data ?? []) as TransactionItem[], total: count ?? 0 };
}

export interface MoneyOverviewResult {
  primary: MoneyOverview;
  others: MoneyOverview[];
  /** Whether upcoming (unpaid) bills apply — only when the period includes today or later. */
  showsPlanned: boolean;
}

/**
 * Actual money for [from, to] (from transactions; bill payments separated, counted once) plus
 * unpaid bills due by `to` when the period reaches today or the future.
 */
export async function getMoneyOverview(
  from: ISODate,
  to: ISODate,
  today: ISODate,
  currency: string,
): Promise<MoneyOverviewResult> {
  const supabase = await createClient();
  const showsPlanned = to >= today;
  const [summary, planned] = await Promise.all([
    supabase.rpc("money_summary", { p_from: from, p_to: to }),
    showsPlanned ? getPlannedBills(to) : Promise.resolve([]),
  ]);
  reportQueryError("transactions:money-summary", summary.error);
  const rows = (summary.data ?? []) as MoneySummaryRow[];
  const upcoming = unpaidBillsUntil(planned, to);
  const currencies = new Set<string>([currency, ...rows.map((row) => row.currency), ...upcoming.keys()]);
  const overviews = [...currencies].map((code) =>
    buildMoneyOverview(
      code,
      rows.find((row) => row.currency === code),
      upcoming.get(code),
    ),
  );
  return {
    primary: overviews.find((overview) => overview.currency === currency)!,
    others: overviews.filter((overview) => overview.currency !== currency && overview.hasActivity),
    showsPlanned,
  };
}

export interface CategorySlice {
  category: string;
  minor: number;
}

export async function getExpenseBreakdown(range: DateRange, currency: string): Promise<CategorySlice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transaction_category_totals", {
    p_from: range.from,
    p_to: range.to,
    p_type: "expense",
    p_currency: currency,
  });
  if (error) {
    reportQueryError("transactions:breakdown", error);
    return [];
  }
  const rows = (data ?? []).map((row) => ({ category: row.category, minor: Number(row.total_minor) }));
  if (rows.length <= MAX_CATEGORY_BARS) return rows;
  const head = rows.slice(0, MAX_CATEGORY_BARS - 1);
  const rest = rows.slice(MAX_CATEGORY_BARS - 1).reduce((sum, row) => sum + row.minor, 0);
  return [...head, { category: "Other categories", minor: rest }];
}

export interface TrendPoint {
  month: string; // YYYY-MM
  income: number;
  expense: number;
}

/** Last TREND_MONTHS months ending at `endDate`'s month; empty months are filled with zero. */
export async function getMonthlyTrend(endDate: ISODate, currency: string): Promise<TrendPoint[]> {
  const supabase = await createClient();
  const first = startOfMonth(addMonthsClamped(endDate, -(TREND_MONTHS - 1)));
  const last = endOfMonth(endDate);
  const { data, error } = await supabase.rpc("transaction_monthly_trend", {
    p_from: first,
    p_to: last,
    p_currency: currency,
  });
  reportQueryError("transactions:trend", error);
  const byMonth = new Map((data ?? []).map((row) => [monthKey(row.month), row]));
  return Array.from({ length: TREND_MONTHS }, (_, i) => {
    const key = monthKey(addMonthsClamped(first, i));
    const row = byMonth.get(key);
    return { month: key, income: Number(row?.income_minor ?? 0), expense: Number(row?.expense_minor ?? 0) };
  });
}

export async function getTransactionCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("category")
    .order("occurred_on", { ascending: false })
    .limit(500);
  return [...new Set((data ?? []).map((row) => row.category))].sort((a, b) => a.localeCompare(b)).slice(0, 60);
}

export async function getRecentTransactions(limit = 5): Promise<TransactionItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(COLUMNS)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  reportQueryError("transactions:recent", error);
  return (data ?? []) as TransactionItem[];
}
