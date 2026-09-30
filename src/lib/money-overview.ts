import type { ISODate } from "@/lib/dates";
import { sumMinor } from "@/lib/money";
import { occurrencesBetween, type Recurrence } from "@/lib/recurrence";

/**
 * Available money model (per currency, for a period such as this month):
 *
 *   Income − paid bills − other expenses          = Available now        (actual money)
 *   Available now − unpaid bills due by period end = After upcoming bills (planned)
 *
 * Paid bills are expense transactions linked to a bill payment, so they are part of the
 * actual transactions exactly once. Unpaid bills are never transactions; they are projected
 * from the bill schedule here.
 */

export interface MoneySummaryRow {
  currency: string;
  income_minor: number;
  bill_expense_minor: number;
  other_expense_minor: number;
  tx_count: number;
}

export interface PlannedBill {
  kind: "bill" | "reminder";
  status: "active" | "completed";
  amount_minor: number | null;
  currency: string;
  recurrence: Recurrence;
  anchor_date: ISODate;
  next_due_date: ISODate;
}

export interface UpcomingTotals {
  total: number;
  count: number;
}

/**
 * Unpaid bill amounts due on or before `until`, per currency. Every remaining occurrence of
 * a recurring bill is counted (a weekly bill due three more times counts three times), and
 * overdue occurrences are included because they are still owed. Month-end anchors use the
 * shared recurrence engine, so Jan 31 → Feb 28 → Mar 31 holds here too.
 */
export function unpaidBillsUntil(bills: readonly PlannedBill[], until: ISODate): Map<string, UpcomingTotals> {
  const totals = new Map<string, { amounts: number[]; count: number }>();
  for (const bill of bills) {
    if (bill.kind !== "bill" || bill.status !== "active" || bill.amount_minor === null) continue;
    if (bill.next_due_date > until) continue;
    const dates = occurrencesBetween(bill.anchor_date, bill.recurrence, bill.next_due_date, until, 1000);
    if (dates.length === 0) continue;
    const entry = totals.get(bill.currency) ?? { amounts: [], count: 0 };
    for (let i = 0; i < dates.length; i += 1) entry.amounts.push(bill.amount_minor);
    entry.count += dates.length;
    totals.set(bill.currency, entry);
  }
  return new Map([...totals].map(([currency, entry]) => [currency, { total: sumMinor(entry.amounts), count: entry.count }]));
}

export interface MoneyOverview {
  currency: string;
  income: number;
  paidBills: number;
  otherExpenses: number;
  spent: number;
  availableNow: number;
  upcomingBills: number;
  upcomingCount: number;
  afterUpcoming: number;
  hasActivity: boolean;
}

export function buildMoneyOverview(
  currency: string,
  summary: MoneySummaryRow | undefined,
  upcoming: UpcomingTotals | undefined,
): MoneyOverview {
  const income = Number(summary?.income_minor ?? 0);
  const paidBills = Number(summary?.bill_expense_minor ?? 0);
  const otherExpenses = Number(summary?.other_expense_minor ?? 0);
  const spent = sumMinor([paidBills, otherExpenses]);
  const availableNow = sumMinor([income, -spent]);
  const upcomingBills = upcoming?.total ?? 0;
  return {
    currency,
    income,
    paidBills,
    otherExpenses,
    spent,
    availableNow,
    upcomingBills,
    upcomingCount: upcoming?.count ?? 0,
    afterUpcoming: sumMinor([availableNow, -upcomingBills]),
    hasActivity: Number(summary?.tx_count ?? 0) > 0 || upcomingBills > 0,
  };
}
