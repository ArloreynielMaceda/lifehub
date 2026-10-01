"use client";

import { Check, ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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

function describeDay(entries: DayEntry[]): string {
  const tasks = entries.filter((entry) => entry.type === "task").length;
  const routines = entries.filter((entry) => entry.type === "routine");
  const done = routines.filter((entry) => entry.type === "routine" && entry.occurrence.completed).length;
  const parts = [
    tasks ? `${tasks} task${tasks === 1 ? "" : "s"}` : null,
    routines.length ? `${routines.length} routine${routines.length === 1 ? "" : "s"}${done ? `, ${done} done` : ""}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing scheduled";
}

/**
 * Phone layout: a compact month grid (dots show what's on each day) and the selected day's
 * tasks and routines below it. Daily routines no longer repeat down the page.
 */
function MobileMonth({
  days,
  currentMonth,
  today,
  byDay,
  entryKey,
}: {
  days: ISODate[];
  currentMonth: string;
  today: ISODate;
  byDay: Map<ISODate, DayEntry[]>;
  entryKey: (entry: DayEntry) => string;
}) {
  const { openCreate } = useTaskEditor();
  const [selected, setSelected] = useState<ISODate | null>(null);
  const fallback = monthKey(today) === currentMonth ? today : `${currentMonth}-01`;
  // A selection from another month (after navigating) falls back to today / the 1st.
  const activeDay = selected && days.includes(selected) ? selected : fallback;
  const entries = byDay.get(activeDay) ?? [];

  return (
    <div className="space-y-4 sm:hidden">
      <div className="rounded-xl border bg-card p-2">
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day} className="py-1">
              {day.charAt(0)}
            </span>
          ))}
        </div>
        <ol className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const dayEntries = byDay.get(day) ?? [];
            const hasTask = dayEntries.some((entry) => entry.type === "task");
            const routineEntries = dayEntries.filter((entry) => entry.type === "routine");
            const allRoutinesDone =
              routineEntries.length > 0 && routineEntries.every((entry) => entry.type === "routine" && entry.occurrence.completed);
            const isSelected = day === activeDay;
            const isToday = day === today;
            const inMonth = monthKey(day) === currentMonth;
            return (
              <li key={day} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setSelected(day)}
                  aria-pressed={isSelected}
                  aria-label={`${formatISODate(day, "weekday")}${isToday ? " (today)" : ""}: ${describeDay(dayEntries)}`}
                  className={cn(
                    "flex h-11 w-full max-w-11 flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    !isSelected && isToday && "font-semibold text-primary",
                    !isSelected && !inMonth && "text-muted-foreground/60",
                  )}
                >
                  <span className="tabular leading-none">{Number(day.slice(8))}</span>
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                    {hasTask ? (
                      <span className={cn("size-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-foreground/60")} />
                    ) : null}
                    {routineEntries.length ? (
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          isSelected
                            ? "border border-primary-foreground"
                            : allRoutinesDone
                              ? "bg-primary"
                              : "border border-primary",
                          isSelected && allRoutinesDone && "bg-primary-foreground",
                        )}
                      />
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground" aria-hidden="true">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-foreground/60" /> Tasks
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full border border-primary" /> Routines
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-primary" /> All routines done
          </span>
        </p>
      </div>

      <section aria-live="polite" aria-label={`Selected day, ${formatISODate(activeDay, "weekday")}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className={cn("text-sm font-semibold", activeDay === today ? "text-primary" : "text-foreground")}>
            {formatISODate(activeDay, "weekday")}
            {activeDay === today ? " · Today" : ""}
          </h3>
          <Button variant="ghost" size="sm" onClick={() => openCreate({ dueDate: activeDay })}>
            <Plus aria-hidden="true" /> Add task
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/60 p-5 text-center text-sm text-muted-foreground">
            Nothing scheduled for this day.
          </p>
        ) : (
          <ul className="space-y-1.5 rounded-xl border bg-card p-1.5">
            {entries.map((entry) => (
              <li key={entryKey(entry)}>
                {entry.type === "task" ? (
                  <TaskChip task={entry.task} size="agenda" />
                ) : (
                  <RoutineChip occurrence={entry.occurrence} today={today} size="agenda" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
          Routines have a dashed outline. Select one on today or an earlier day to tick it off.
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

      {/* Phones: compact month grid + the selected day's items */}
      <MobileMonth days={days} currentMonth={currentMonth} today={today} byDay={byDay} entryKey={entryKey} />

    </section>
  );
}
