import type { CompanionMood } from "@/components/companion/companion";
import { diffInDays, formatISODate, type ISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export interface NextDueItem {
  title: string;
  kind: "bill" | "reminder";
  next_due_date: ISODate;
  amount_minor: number | null;
  currency: string;
}

export interface BillNudge {
  mood: CompanionMood;
  tone: "default" | "warning";
  /** Overdue, due today or due tomorrow: worth the larger reminder banner. */
  urgent: boolean;
  text: string;
}

/**
 * The companion's reminder on the Bills page: the single most pressing item (the earliest
 * active due date), which the summary tiles don't show by name.
 */
export function billNudge(next: NextDueItem | null, today: ISODate, overdueCount: number): BillNudge | null {
  if (!next) return null;
  const days = diffInDays(next.next_due_date, today);
  const amount = next.kind === "bill" && next.amount_minor ? ` (${formatMoney(next.amount_minor, next.currency)})` : "";
  const name = `${next.title}${amount}`;

  if (days < 0) {
    const others = overdueCount - 1;
    return {
      mood: "surprised",
      tone: "warning",
      urgent: true,
      text:
        others > 0
          ? `${name} and ${others} more are overdue. Mark them paid, or skip the ones that don't apply.`
          : `${name} is overdue. It was due ${formatISODate(next.next_due_date, "short")}.`,
    };
  }
  if (days === 0) return { mood: "calm", tone: "default", urgent: true, text: `${name} is due today.` };
  if (days === 1) return { mood: "calm", tone: "default", urgent: true, text: `Next up: ${name}, due tomorrow.` };
  if (days <= 6) {
    return {
      mood: "calm",
      tone: "default",
      urgent: false,
      text: `Next up: ${name}, due ${formatISODate(next.next_due_date, "weekday")}.`,
    };
  }
  return {
    mood: "happy",
    tone: "default",
    urgent: false,
    text: `Nothing due this week. Next up: ${name} on ${formatISODate(next.next_due_date, "short")}.`,
  };
}
