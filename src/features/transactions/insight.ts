import { formatMoney } from "@/lib/money";
import type { MoneyOverview } from "@/lib/money-overview";

export interface MoneyInsight {
  tone: "default" | "warning";
  text: string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * One plain-language observation about the period, computed only from the numbers already on
 * screen (never a forecast or advice). Null when there is nothing worth saying.
 */
export function moneyInsight(o: MoneyOverview, showsPlanned: boolean): MoneyInsight | null {
  const money = (minor: number) => formatMoney(minor, o.currency);

  if (showsPlanned && o.upcomingCount > 0) {
    const one = o.upcomingCount === 1;
    const bills = `${one ? "unpaid bill" : plural(o.upcomingCount, "unpaid bill")} (${money(o.upcomingBills)})`;
    if (o.afterUpcoming < 0) {
      return {
        tone: "warning",
        text: `Your ${bills} ${one ? "is" : "add up to"} ${money(-o.afterUpcoming)} more than you have available now.`,
      };
    }
    return { tone: "default", text: `After your ${bills}, you'll still have ${money(o.afterUpcoming)}.` };
  }

  if (!o.hasActivity) return null;

  if (o.income > 0) {
    if (o.spent > o.income) {
      return { tone: "warning", text: `You've spent ${money(o.spent - o.income)} more than you earned in this period.` };
    }
    if (o.spent === 0) return { tone: "default", text: `Nothing spent yet in this period — ${money(o.availableNow)} available.` };
    const percent = Math.round((o.spent / o.income) * 100);
    return {
      tone: "default",
      text: `You've spent ${percent}% of this period's income, so ${money(o.availableNow)} is still available.`,
    };
  }

  if (o.spent > 0) {
    return { tone: "default", text: `${money(o.spent)} spent so far, with no income recorded in this period.` };
  }
  return null;
}
