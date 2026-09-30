"use client";

import { Check, ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { calendarGrid } from "@/lib/calendar";
import { addMonthsClamped, formatISODate, monthKey, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import type { RoutineOccurrence, TaskItem } from "../queries";
import { useRoutineCompletion } from "./routine-list";
import { useTaskEditor } from "./task-editor";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRIORITY_DOT = { high: "bg-destructive", medium: "bg-warning", low: "bg-muted-foreground/50" } as const;

type DayEntry = { type: "task"; task: TaskItem } | { type: "routine"; occurrence: RoutineOccurrence };

/**
 * A routine on one calendar day. Today and earlier: toggles that day's completion (other
 * days are unaffected). Future days: opens the routine to edit.
 */
function RoutineChip({ occurrence, today, size }: { occurrence: RoutineOccurrence; today: ISODate; size: "grid" | "agenda" }) {
  const { openEdit } = useTaskEditor();
  const { done, toggle, pending } = useRoutineCompletion(occurrence.routine, occurrence.date, occurrence.completed);
  const canToggle = occurrence.date <= today;
  const label = canToggle
    ? `${occurrence.routine.title}, ${formatISODate(occurrence.date, "long")}: ${done ? "done" : "not done"}`
    : `${occurrence.routine.title}, routine on ${formatISODate(occurrence.date, "long")}`;
  return (
    <button
      type="button"
      onClick={() => (canToggle ? toggle() : openEdit(occurrence.routine))}
      aria-pressed={canToggle ? done : undefined}
      aria-label={label}
      title={canToggle ? (done ? "Done — click to undo" : "Click to mark done") : "Routine — click to edit"}
      disabled={pending}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md border border-dashed border-primary/40 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        size === "grid" ? "px-1.5 py-0.5 text-xs" : "px-3 py-2.5 text-sm",
        done ? "border-solid bg-success-soft text-success" : "bg-card hover:bg-accent",
      )}
    >
      {done ? (
        <Check className={size === "grid" ? "size-3 shrink-0" : "size-4 shrink-0"} aria-hidden="true" />
      ) : (
        <Repeat className={cn(size === "grid" ? "size-3" : "size-4", "shrink-0 text-primary")} aria-hidden="true" />
      )}
      <span className={cn("truncate", done && "line-through decoration-success/60")}>{occurrence.routine.title}</span>
    </button>
  );
}

function TaskChip({ task, size }: { task: TaskItem; size: "grid" | "agenda" }) {
  const { openEdit } = useTaskEditor();
  return (
    <button
      type="button"
      onClick={() => openEdit(task)}
      className={cn(
        "flex w-full items-center gap-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        size === "grid" ? "rounded-md bg-muted/70 px-1.5 py-1 text-xs hover:bg-accent" : "px-3 py-2.5 text-sm",
        task.status === "completed" && "text-muted-foreground line-through",
      )}
    >
      <span className={cn("shrink-0 rounded-full", size === "grid" ? "size-1.5" : "size-2", PRIORITY_DOT[task.priority])} aria-hidden="true" />
      <span className="truncate">{task.title}</span>
    </button>
  );
}

export function TaskCalendar({
  month,
  today,
  tasks,
  routines,
  baseQuery,
}: {
  month: ISODate;
  today: ISODate;
  tasks: TaskItem[];
  routines: RoutineOccurrence[];
  baseQuery: string;
}) {
  const { openCreate } = useTaskEditor();
  const { days } = calendarGrid(month);
  const byDay = new Map<ISODate, DayEntry[]>();
  const push = (date: ISODate, entry: DayEntry) => {
    const list = byDay.get(date) ?? [];
    list.push(entry);
    byDay.set(date, list);
  };
  for (const task of tasks) if (task.due_date) push(task.due_date, { type: "task", task });
  for (const occurrence of routines) push(occurrence.date, { type: "routine", occurrence });

  const currentMonth = monthKey(month);
  const monthHref = (target: ISODate) => {
    const params = new URLSearchParams(baseQuery);
    params.set("view", "calendar");
    params.set("month", monthKey(target));
    return `/tasks?${params.toString()}`;
  };
  const agendaDays = days.filter((day) => monthKey(day) === currentMonth && byDay.has(day));
  const entryKey = (entry: DayEntry) => (entry.type === "task" ? entry.task.id : `${entry.occurrence.routine.id}:${entry.occurrence.date}`);

  return (
    <section aria-label={`Tasks and routines in ${formatISODate(month, "month")}`} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">{formatISODate(month, "month")}</h2>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon-sm">
            <Link href={monthHref(addMonthsClamped(month, -1))} scroll={false} aria-label="Previous month">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={monthHref(today)} scroll={false}>
              Today
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm">
            <Link href={monthHref(addMonthsClamped(month, 1))} scroll={false} aria-label="Next month">
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      {routines.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Repeat className="size-3.5 text-primary" aria-hidden="true" />
          Routines have a dashed outline. Click one on today or an earlier day to tick it off.
        </p>
      ) : null}

      {/* Month grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
        <div className="grid grid-cols-7 border-b bg-muted/40" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-2 text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        <ol className="grid grid-cols-7">
          {days.map((day, index) => {
            const inMonth = monthKey(day) === currentMonth;
            const isToday = day === today;
            const entries = byDay.get(day) ?? [];
            const visible = entries.slice(0, 3);
            return (
              <li
                key={day}
                className={cn(
                  "group/day relative min-h-28 border-b p-1.5",
                  index % 7 !== 6 && "border-r",
                  !inMonth && "bg-muted/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <time
                    dateTime={day}
                    className={cn(
                      "tabular flex size-6 items-center justify-center rounded-full text-xs",
                      isToday ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {Number(day.slice(8))}
                  </time>
                  <button
                    type="button"
                    onClick={() => openCreate({ dueDate: day })}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Add task on ${formatISODate(day, "long")}`}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <ul className="mt-1 space-y-1">
                  {visible.map((entry) => (
                    <li key={entryKey(entry)}>
                      {entry.type === "task" ? (
                        <TaskChip task={entry.task} size="grid" />
                      ) : (
                        <RoutineChip occurrence={entry.occurrence} today={today} size="grid" />
                      )}
                    </li>
                  ))}
                  {entries.length > visible.length ? (
                    <li className="px-1.5 text-[11px] text-muted-foreground">+{entries.length - visible.length} more</li>
                  ) : null}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Agenda (phones) */}
      <div className="sm:hidden">
        {agendaDays.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/60 p-6 text-center text-sm text-muted-foreground">
            Nothing scheduled this month.
          </p>
        ) : (
          <ol className="space-y-4">
            {agendaDays.map((day) => (
              <li key={day}>
                <h3 className={cn("mb-1.5 text-xs font-semibold", day === today ? "text-primary" : "text-muted-foreground")}>
                  {formatISODate(day, "weekday")}
                  {day === today ? " · Today" : ""}
                </h3>
                <ul className="space-y-1.5 rounded-xl border bg-card p-1.5">
                  {(byDay.get(day) ?? []).map((entry) => (
                    <li key={entryKey(entry)}>
                      {entry.type === "task" ? (
                        <TaskChip task={entry.task} size="agenda" />
                      ) : (
                        <RoutineChip occurrence={entry.occurrence} today={today} size="agenda" />
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
