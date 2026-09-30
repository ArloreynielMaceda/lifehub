import { z } from "zod";

import { isoDateSchema, monthKeySchema, one, optionalIsoDateSchema, type RawSearchParams } from "@/lib/validation";

import { TASK_PRIORITIES, TASK_SCOPES, TASK_SORTS, TASK_STATUSES } from "./constants";

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(200, "Keep the title under 200 characters"),
  description: z.string().trim().max(5000, "Keep the description under 5,000 characters"),
  dueDate: optionalIsoDateSchema,
  priority: z.enum(TASK_PRIORITIES, "Choose a priority"),
  status: z.enum(TASK_STATUSES, "Choose a status"),
  category: z.string().trim().max(50, "Keep the category under 50 characters"),
});

export type TaskFormValues = z.input<typeof taskFormSchema>;

export const taskStatusSchema = z.enum(TASK_STATUSES);

const reminderTimeSchema = z.union([
  z.literal(""),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Enter a valid time"),
]);

/** Recurring routine: a weekly schedule instead of a single due date. */
export const routineFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give the routine a name").max(200, "Keep the name under 200 characters"),
    description: z.string().trim().max(5000, "Keep the notes under 5,000 characters"),
    priority: z.enum(TASK_PRIORITIES, "Choose a priority"),
    category: z.string().trim().max(50, "Keep the category under 50 characters"),
    repeatDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Choose at least one day")
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    startsOn: isoDateSchema,
    endsOn: optionalIsoDateSchema,
    reminderTime: reminderTimeSchema,
  })
  .refine((values) => !values.endsOn || values.endsOn >= values.startsOn, {
    path: ["endsOn"],
    message: "The end date can't be before the start date",
  });

export type RoutineFormValues = z.input<typeof routineFormSchema>;

const taskFiltersSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  scope: z.enum(TASK_SCOPES).catch("open"),
  status: z.enum(["pending", "in_progress"]).optional().catch(undefined),
  priority: z.enum(TASK_PRIORITIES).optional().catch(undefined),
  category: z.string().trim().max(50).optional().catch(undefined),
  sort: z.enum(TASK_SORTS).catch("due_date"),
  view: z.enum(["list", "calendar"]).catch("list"),
  month: monthKeySchema.optional().catch(undefined),
});

export type TaskFilters = z.output<typeof taskFiltersSchema>;

export function parseTaskFilters(params: RawSearchParams): TaskFilters {
  return taskFiltersSchema.parse({
    q: one(params.q) ?? "",
    scope: one(params.scope),
    status: one(params.status) || undefined,
    priority: one(params.priority) || undefined,
    category: one(params.category) || undefined,
    sort: one(params.sort),
    view: one(params.view),
    month: one(params.month) || undefined,
  });
}
