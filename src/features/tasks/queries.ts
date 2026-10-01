import "server-only";

import { addDays, type ISODate } from "@/lib/dates";
import {
  describeRepeatDays,
  formatReminderTime,
  isScheduledOn,
  nextScheduledDate,
  routineHistory,
  scheduledDatesBetween,
  type HistoryDay,
} from "@/lib/routines";
import { toSearchPattern } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { reportQueryError, throwQueryError } from "@/lib/schema-status";
import type { Task } from "@/types/database";

import { ROUTINE_HISTORY_DAYS, TASK_PAGE_SIZE } from "./constants";
import type { TaskFilters } from "./schemas";

export type TaskItem = Pick<
  Task,
  | "id"
  | "kind"
  | "title"
  | "description"
  | "due_date"
  | "priority"
  | "status"
  | "category"
  | "completed_at"
  | "created_at"
>;

/** A recurring routine: the schedule columns are always present for kind = 'routine'. */
export type RoutineItem = TaskItem & {
  kind: "routine";
  repeat_days: number[];
  starts_on: ISODate;
  ends_on: ISODate | null;
  reminder_time: string | null;
  paused_on: ISODate | null;
};

const COLUMNS = "id, kind, title, description, due_date, priority, status, category, completed_at, created_at";
const ROUTINE_COLUMNS = `${COLUMNS}, repeat_days, starts_on, ends_on, reminder_time, paused_on`;

// ---------------------------------------------------------------------------
// One-time tasks (kind = 'task'). Routines never appear in these lists.
// ---------------------------------------------------------------------------

export async function listTasks(filters: TaskFilters, today: ISODate, page: number) {
  const supabase = await createClient();
  let query = supabase.from("tasks").select(COLUMNS, { count: "exact" }).eq("kind", "task");
  if (filters.q) query = query.ilike("search_text", toSearchPattern(filters.q));
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);

  switch (filters.scope) {
    case "open":
    case "routines":
      query = query.neq("status", "completed");
      break;
    case "today":
      query = query.neq("status", "completed").eq("due_date", today);
      break;
    case "overdue":
      query = query.neq("status", "completed").lt("due_date", today);
      break;
    case "upcoming":
      query = query.neq("status", "completed").gt("due_date", today);
      break;
    case "completed":
      query = query.eq("status", "completed");
      break;
    case "all":
      break;
  }

  if (filters.scope === "completed" && filters.sort === "due_date") {
    query = query.order("completed_at", { ascending: false, nullsFirst: false });
  } else if (filters.sort === "priority") {
    query = query
      .order("priority", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "created_at") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false });
  }
  query = query.order("id", { ascending: true }); // stable pagination

  const from = (page - 1) * TASK_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + TASK_PAGE_SIZE - 1);
  if (error) throwQueryError("tasks:list", error, "Could not load tasks");
  return { tasks: (data ?? []) as TaskItem[], total: count ?? 0 };
}

/** Tasks with a due date inside [from, to], for the calendar view. */
export async function listTasksInRange(filters: TaskFilters, from: ISODate, to: ISODate) {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(COLUMNS)
    .eq("kind", "task")
    .gte("due_date", from)
    .lte("due_date", to);
  if (filters.q) query = query.ilike("search_text", toSearchPattern(filters.q));
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.scope === "completed") query = query.eq("status", "completed");
  else if (filters.scope !== "all") query = query.neq("status", "completed");
  const { data, error } = await query
    .order("due_date", { ascending: true })
    .order("priority", { ascending: false })
    .limit(500);
  if (error) throwQueryError("tasks:range", error, "Could not load tasks");
  return (data ?? []) as TaskItem[];
}

export async function getTaskCounts(today: ISODate) {
  const supabase = await createClient();
  const base = () =>
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("kind", "task").neq("status", "completed");
  const [dueToday, overdue, open, upcomingWeek] = await Promise.all([
    base().eq("due_date", today),
    base().lt("due_date", today),
    base(),
    base().gt("due_date", today).lte("due_date", addDays(today, 7)),
  ]);
  return {
    today: dueToday.count ?? 0,
    overdue: overdue.count ?? 0,
    open: open.count ?? 0,
    upcomingWeek: upcomingWeek.count ?? 0,
  };
}

/** Tasks due today that are already done (dashboard: "everything for today is done"). */
export async function getTasksDoneToday(today: ISODate): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("kind", "task")
    .eq("status", "completed")
    .eq("due_date", today);
  reportQueryError("tasks:done-today", error);
  return count ?? 0;
}

/** Distinct categories the user has used (for filters and suggestions). */
export async function getTaskCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("category")
    .neq("category", "")
    .order("updated_at", { ascending: false })
    .limit(300);
  return [...new Set((data ?? []).map((row) => row.category))].sort((a, b) => a.localeCompare(b)).slice(0, 50);
}

/** Open one-time tasks due today or overdue (dashboard). */
export async function getFocusTasks(today: ISODate, limit = 6) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(COLUMNS)
    .eq("kind", "task")
    .neq("status", "completed")
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .order("priority", { ascending: false })
    .limit(limit);
  reportQueryError("tasks:focus", error);
  return (data ?? []) as TaskItem[];
}

// ---------------------------------------------------------------------------
// Routines (kind = 'routine'). Occurrences are computed from the schedule; only completed
// dates are stored (task_completions).
// ---------------------------------------------------------------------------

export interface RoutineView extends RoutineItem {
  scheduleLabel: string;
  reminderLabel: string | null;
  paused: boolean;
  scheduledToday: boolean;
  completedToday: boolean;
  nextDate: ISODate | null;
  history: HistoryDay[];
}

export interface RoutineOccurrence {
  date: ISODate;
  routine: RoutineItem;
  completed: boolean;
}

function matchesFilters(routine: RoutineItem, filters?: Pick<TaskFilters, "q" | "priority" | "category">): boolean {
  if (!filters) return true;
  if (filters.priority && routine.priority !== filters.priority) return false;
  if (filters.category && routine.category !== filters.category) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = `${routine.title} ${routine.description} ${routine.category}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export async function listRoutines(
  filters?: Pick<TaskFilters, "q" | "priority" | "category">,
): Promise<RoutineItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(ROUTINE_COLUMNS)
    .eq("kind", "routine")
    .order("title", { ascending: true })
    .limit(200);
  if (error) throwQueryError("routines:list", error, "Could not load routines");
  return ((data ?? []) as RoutineItem[]).filter((routine) => matchesFilters(routine, filters));
}

/** Completed dates per routine within [from, to]. */
export async function getCompletedDates(
  routineIds: string[],
  from: ISODate,
  to: ISODate,
): Promise<Map<string, Set<ISODate>>> {
  const map = new Map<string, Set<ISODate>>();
  if (routineIds.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_completions")
    .select("task_id, occurred_on")
    .in("task_id", routineIds)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .limit(5000);
  reportQueryError("routines:completions", error);
  for (const row of data ?? []) {
    const set = map.get(row.task_id) ?? new Set<ISODate>();
    set.add(row.occurred_on);
    map.set(row.task_id, set);
  }
  return map;
}

export async function getRoutineViews(
  today: ISODate,
  filters?: Pick<TaskFilters, "q" | "priority" | "category">,
): Promise<RoutineView[]> {
  const routines = await listRoutines(filters);
  const from = addDays(today, -(ROUTINE_HISTORY_DAYS - 1));
  const completed = await getCompletedDates(
    routines.map((routine) => routine.id),
    from,
    today,
  );
  return routines.map((routine) => {
    const dates = completed.get(routine.id) ?? new Set<ISODate>();
    const scheduledToday = isScheduledOn(routine, today);
    return {
      ...routine,
      scheduleLabel: describeRepeatDays(routine.repeat_days),
      reminderLabel: formatReminderTime(routine.reminder_time),
      paused: routine.paused_on !== null,
      scheduledToday,
      completedToday: dates.has(today),
      nextDate: nextScheduledDate(routine, scheduledToday ? addDays(today, 1) : today),
      history: routineHistory(routine, dates, today, ROUTINE_HISTORY_DAYS),
    };
  });
}

/** Routine occurrences for every scheduled date in [from, to] (calendar view). */
export async function getRoutineOccurrences(
  from: ISODate,
  to: ISODate,
  filters?: Pick<TaskFilters, "q" | "priority" | "category">,
): Promise<RoutineOccurrence[]> {
  const routines = await listRoutines(filters);
  const completed = await getCompletedDates(
    routines.map((routine) => routine.id),
    from,
    to,
  );
  const occurrences: RoutineOccurrence[] = [];
  for (const routine of routines) {
    const done = completed.get(routine.id) ?? new Set<ISODate>();
    for (const date of scheduledDatesBetween(routine, from, to, 62)) {
      occurrences.push({ date, routine, completed: done.has(date) });
    }
  }
  return occurrences;
}
