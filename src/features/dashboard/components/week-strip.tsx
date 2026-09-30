import { formatISODate, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import type { WeekDay } from "../queries";

function describe(day: WeekDay): string {
  const parts = [
    day.tasks ? `${day.tasks} task${day.tasks === 1 ? "" : "s"}` : null,
    day.bills ? `${day.bills} bill${day.bills === 1 ? "" : "s"}` : null,
    day.reminders ? `${day.reminders} reminder${day.reminders === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing due";
}

/** Seven-day strip; dots mark days with something due (details in the accessible label). */
export function WeekStrip({ days, today }: { days: WeekDay[]; today: ISODate }) {
  return (
    <ol className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const isToday = day.date === today;
        const past = day.date < today;
        const total = day.tasks + day.bills + day.reminders;
        return (
          <li key={day.date}>
            <div
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2",
                isToday ? "bg-primary text-primary-foreground" : past ? "text-muted-foreground" : "text-foreground",
              )}
            >
              <span aria-hidden="true" className={cn("text-[11px]", isToday ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {formatISODate(day.date, "day")}
              </span>
              <span aria-hidden="true" className="tabular text-base font-semibold">{Number(day.date.slice(8))}</span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                {total === 0 ? null : (
                  <>
                    {day.tasks ? <span className={cn("size-1.5 rounded-full", isToday ? "bg-primary-foreground" : "bg-foreground/70")} /> : null}
                    {day.bills ? <span className={cn("size-1.5 rounded-full", isToday ? "bg-primary-foreground" : "bg-primary")} /> : null}
                    {day.reminders ? <span className={cn("size-1.5 rounded-full", isToday ? "bg-primary-foreground/70" : "bg-info")} /> : null}
                  </>
                )}
              </span>
              <span className="sr-only">
                {formatISODate(day.date, "weekday")}
                {isToday ? " (today)" : ""}: {describe(day)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
