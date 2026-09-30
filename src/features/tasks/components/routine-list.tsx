"use client";

import { Bell, MoreHorizontal, Pause, Pencil, Play, Repeat, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatISODate, relativeDayLabel, type ISODate } from "@/lib/dates";
import { isoWeekday, WEEKDAY_SHORT, type HistoryDay } from "@/lib/routines";
import { cn } from "@/lib/utils";

import { deleteTask, setRoutineCompletion, setRoutinePaused } from "../actions";
import type { RoutineView } from "../queries";
import { useTaskEditor } from "./task-editor";

/** Optimistic done/not-done toggle for one routine on one date. */
export function useRoutineCompletion(routine: { id: string; title: string }, date: ISODate, completed: boolean) {
  const [done, setDone] = useOptimistic(completed);
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const next = !done;
      setDone(next);
      const result = await setRoutineCompletion(routine.id, date, next);
      if (!result.ok) toast.error(result.error);
    });
  return { done, toggle, pending };
}

function HistoryStrip({ history, today }: { history: HistoryDay[]; today: ISODate }) {
  const scheduled = history.filter((day) => day.scheduled);
  const completed = history.filter((day) => day.completed).length;
  const summary = scheduled.length
    ? `Last 7 days: done ${completed} of ${scheduled.length} scheduled days`
    : "Not scheduled in the last 7 days";
  return (
    <div className="flex items-center gap-2">
      <ol className="flex gap-0.5 sm:gap-1" aria-label={summary}>
        {history.map((day) => {
          const isToday = day.date === today;
          const state = day.completed ? "Done" : day.scheduled ? (isToday ? "Not done yet" : "Not done") : "Not scheduled";
          return (
            <li
              key={day.date}
              title={`${formatISODate(day.date, "short")}: ${state}`}
              className={cn(
                "flex size-5 items-center justify-center rounded-md text-[10px] font-medium sm:size-6",
                day.completed && "bg-primary text-primary-foreground",
                !day.completed && day.scheduled && !isToday && "border border-dashed border-muted-foreground/50 text-muted-foreground",
                !day.completed && day.scheduled && isToday && "border border-primary text-primary",
                !day.scheduled && !day.completed && "bg-muted/60 text-muted-foreground/50",
              )}
            >
              <span aria-hidden="true">{WEEKDAY_SHORT[isoWeekday(day.date)].charAt(0)}</span>
              <span className="sr-only">
                {formatISODate(day.date, "weekday")}: {state}
              </span>
            </li>
          );
        })}
      </ol>
      <span className="tabular hidden text-xs text-muted-foreground sm:inline" aria-hidden="true">
        {scheduled.length ? `${completed}/${scheduled.length}` : ""}
      </span>
    </div>
  );
}

function RoutineStatus({ routine, today, done }: { routine: RoutineView; today: ISODate; done: boolean }) {
  if (routine.paused) return <Badge variant="muted">Paused</Badge>;
  if (routine.scheduledToday) {
    return done ? <Badge variant="success">Completed today</Badge> : <Badge variant="warning">Due today</Badge>;
  }
  if (routine.nextDate) {
    return <span className="text-xs text-muted-foreground">Next: {relativeDayLabel(routine.nextDate, today)}</span>;
  }
  return <Badge variant="muted">Ended</Badge>;
}

export function RoutineRow({ routine, today }: { routine: RoutineView; today: ISODate }) {
  const { openEdit } = useTaskEditor();
  const { done, toggle } = useRoutineCompletion(routine, today, routine.completedToday);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();
  const canCompleteToday = routine.scheduledToday && !routine.paused;

  const togglePaused = () =>
    startTransition(async () => {
      const result = await setRoutinePaused(routine.id, !routine.paused);
      if (result.ok) toast.success(result.message ?? "Saved");
      else toast.error(result.error);
    });

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3.5 sm:px-5", routine.paused && "bg-muted/30")}>
      {canCompleteToday ? (
        <Checkbox
          checked={done}
          onCheckedChange={toggle}
          aria-label={done ? `Mark "${routine.title}" not done today` : `Mark "${routine.title}" done today`}
          className="mt-0.5 size-5 rounded-full"
        />
      ) : (
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
          <Repeat className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => openEdit(routine)}
              className="block max-w-full rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className={cn("block truncate text-sm font-medium", done && canCompleteToday && "text-muted-foreground line-through")}>
                {routine.title}
              </span>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                <Repeat className="size-3.5" aria-hidden="true" />
                {routine.scheduleLabel}
              </span>
              {routine.reminderLabel ? (
                <span className="inline-flex items-center gap-1">
                  <Bell className="size-3" aria-hidden="true" />
                  {routine.reminderLabel}
                </span>
              ) : null}
              {routine.category ? (
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  {routine.category}
                </Badge>
              ) : null}
              <RoutineStatus routine={routine} today={today} done={done} />
            </div>
          </div>
          <HistoryStrip history={routine.history.map((day) => (day.date === today ? { ...day, completed: done } : day))} today={today} />
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for "${routine.title}"`} className="text-muted-foreground">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => openEdit(routine)}>
            <Pencil aria-hidden="true" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={togglePaused}>
            {routine.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {routine.paused ? "Resume" : "Pause"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden="true" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this routine?"
        description={`"${routine.title}" and its completion history will be permanently deleted. To stop it for a while instead, pause it.`}
        onConfirm={async () => {
          const result = await deleteTask(routine.id);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.message ?? "Routine deleted");
        }}
      />
    </li>
  );
}

export function RoutineList({ routines, today }: { routines: RoutineView[]; today: ISODate }) {
  const active = routines.filter((routine) => !routine.paused);
  const paused = routines.filter((routine) => routine.paused);
  return (
    <div className="space-y-5">
      {active.length > 0 ? (
        <ul role="list" className="divide-y overflow-hidden rounded-xl border bg-card">
          {active.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} today={today} />
          ))}
        </ul>
      ) : null}
      {paused.length > 0 ? (
        <section aria-labelledby="paused-routines-heading" className="space-y-2">
          <h2 id="paused-routines-heading" className="eyebrow">
            Paused
          </h2>
          <ul role="list" className="divide-y overflow-hidden rounded-xl border bg-card">
            {paused.map((routine) => (
              <RoutineRow key={routine.id} routine={routine} today={today} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TodayRoutineItem({ routine, today }: { routine: RoutineView; today: ISODate }) {
  const { done, toggle } = useRoutineCompletion(routine, today, routine.completedToday);
  return (
    <li className="flex items-center gap-3 py-2">
      <Checkbox
        checked={done}
        onCheckedChange={toggle}
        aria-label={done ? `Mark "${routine.title}" not done today` : `Mark "${routine.title}" done today`}
        className="size-5 rounded-full"
      />
      <span className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted-foreground line-through")}>
        {routine.title}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{routine.reminderLabel ?? routine.scheduleLabel}</span>
    </li>
  );
}

/** Compact list of routines scheduled today (tasks page and dashboard). */
export function TodayRoutines({
  routines,
  today,
  className,
  bare = false,
}: {
  routines: RoutineView[];
  today: ISODate;
  className?: string;
  bare?: boolean;
}) {
  const due = routines.filter((routine) => routine.scheduledToday && !routine.paused);
  if (due.length === 0) return null;
  const doneCount = due.filter((routine) => routine.completedToday).length;
  return (
    <section
      aria-labelledby="today-routines-heading"
      className={cn(bare ? "" : "rounded-xl border bg-card px-4 py-3 sm:px-5", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="today-routines-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Repeat className="size-4 text-primary" aria-hidden="true" />
          Today&apos;s routines
        </h2>
        <span className="tabular text-xs text-muted-foreground">
          {doneCount} of {due.length} done
        </span>
      </div>
      <ul role="list" className="mt-1 divide-y">
        {due.map((routine) => (
          <TodayRoutineItem key={routine.id} routine={routine} today={today} />
        ))}
      </ul>
    </section>
  );
}
