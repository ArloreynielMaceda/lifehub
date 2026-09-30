import { CalendarDays } from "lucide-react";

import { diffInDays, formatISODate, relativeDayLabel, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type DueTone = "overdue" | "today" | "soon" | "later" | "done" | "none";

export function dueTone(date: ISODate | null, today: ISODate, done = false): DueTone {
  if (!date) return "none";
  if (done) return "done";
  const diff = diffInDays(date, today);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "later";
}

const TONE_CLASSES: Record<DueTone, string> = {
  overdue: "text-destructive",
  today: "text-warning",
  soon: "text-foreground",
  later: "text-muted-foreground",
  done: "text-muted-foreground",
  none: "text-muted-foreground",
};

/** Due date with a relative label; the tone is conveyed by text, not colour alone. */
export function DueLabel({
  date,
  today,
  done = false,
  className,
  showIcon = false,
}: {
  date: ISODate | null;
  today: ISODate;
  done?: boolean;
  className?: string;
  showIcon?: boolean;
}) {
  const tone = dueTone(date, today, done);
  if (!date) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No due date</span>;
  }
  const relative = relativeDayLabel(date, today);
  const text = tone === "overdue" ? `Overdue · ${formatISODate(date, "short")}` : relative;
  return (
    <time
      dateTime={date}
      title={formatISODate(date, "long")}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap tabular",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {showIcon ? <CalendarDays className="size-3.5" aria-hidden="true" /> : null}
      {text}
    </time>
  );
}
