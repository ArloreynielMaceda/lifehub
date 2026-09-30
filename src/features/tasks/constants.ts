import type { Enums } from "@/types/database";

export type TaskPriority = Enums<"task_priority">;
export type TaskStatus = Enums<"task_status">;

export const TASK_PRIORITIES = ["low", "medium", "high"] as const satisfies readonly TaskPriority[];
export const TASK_STATUSES = ["pending", "in_progress", "completed"] as const satisfies readonly TaskStatus[];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

export const TASK_SCOPES = ["open", "today", "overdue", "upcoming", "completed", "all", "routines"] as const;
export type TaskScope = (typeof TASK_SCOPES)[number];

export const SCOPE_LABELS: Record<TaskScope, string> = {
  open: "Open",
  today: "Today",
  overdue: "Overdue",
  upcoming: "Upcoming",
  completed: "Completed",
  all: "All",
  routines: "Routines",
};

export type TaskKind = "task" | "routine";

export const ROUTINE_PRESET_LABELS = {
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekends: "Every weekend (Sat–Sun)",
  custom: "Specific days",
} as const;

/** Days of completion history shown for each routine. */
export const ROUTINE_HISTORY_DAYS = 7;

export const TASK_SORTS = ["due_date", "priority", "created_at"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export const SORT_LABELS: Record<TaskSort, string> = {
  due_date: "Due date",
  priority: "Priority",
  created_at: "Newest first",
};

export const TASK_PAGE_SIZE = 20;

export const SUGGESTED_TASK_CATEGORIES = ["Personal", "Work", "School", "Home", "Errands", "Health", "Family"];
