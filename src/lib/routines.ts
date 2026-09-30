import { addDays, dayOfWeek, minISODate, type ISODate } from "@/lib/dates";

/**
 * Recurring routines ("Take vitamins every day", "Exercise Mon/Wed/Fri").
 *
 * A routine stores only its schedule; occurrences are computed here and completions are
 * stored per date. Weekdays use ISO numbering: 1 = Monday … 7 = Sunday. All dates are civil
 * dates (YYYY-MM-DD) in the user's time zone, so there are no DST or UTC-offset surprises.
 */

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_SHORT: Record<IsoWeekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

export const WEEKDAY_LONG: Record<IsoWeekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const ROUTINE_PRESETS = {
  daily: [1, 2, 3, 4, 5, 6, 7],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [6, 7],
} as const satisfies Record<string, readonly IsoWeekday[]>;

export type RoutinePreset = keyof typeof ROUTINE_PRESETS | "custom";

export interface RoutineSchedule {
  repeat_days: readonly number[];
  starts_on: ISODate;
  ends_on: ISODate | null;
  paused_on: ISODate | null;
}

export function isoWeekday(date: ISODate): IsoWeekday {
  const day = dayOfWeek(date);
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** Sorted, de-duplicated, valid ISO weekdays. */
export function normalizeWeekdays(days: readonly number[]): IsoWeekday[] {
  return [...new Set(days)]
    .filter((day): day is IsoWeekday => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b);
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  const x = normalizeWeekdays(a);
  const y = normalizeWeekdays(b);
  return x.length === y.length && x.every((day, i) => day === y[i]);
}

export function presetFor(days: readonly number[]): RoutinePreset {
  if (sameDays(days, ROUTINE_PRESETS.daily)) return "daily";
  if (sameDays(days, ROUTINE_PRESETS.weekdays)) return "weekdays";
  if (sameDays(days, ROUTINE_PRESETS.weekends)) return "weekends";
  return "custom";
}

/** "Every day", "Every weekday", "Every weekend", "Every Monday", "Mon, Wed, Fri". */
export function describeRepeatDays(days: readonly number[]): string {
  const normalized = normalizeWeekdays(days);
  switch (presetFor(normalized)) {
    case "daily":
      return "Every day";
    case "weekdays":
      return "Every weekday";
    case "weekends":
      return "Every weekend";
    default:
      if (normalized.length === 1) return `Every ${WEEKDAY_LONG[normalized[0]!]}`;
      return normalized.map((day) => WEEKDAY_SHORT[day]).join(", ");
  }
}

/** Last day the routine can occur (end date or the day before it was paused), if any. */
function lastPossibleDate(schedule: RoutineSchedule): ISODate | null {
  const pausedLimit = schedule.paused_on ? addDays(schedule.paused_on, -1) : null;
  if (schedule.ends_on && pausedLimit) return minISODate(schedule.ends_on, pausedLimit);
  return schedule.ends_on ?? pausedLimit;
}

export function isScheduledOn(schedule: RoutineSchedule, date: ISODate): boolean {
  if (date < schedule.starts_on) return false;
  const last = lastPossibleDate(schedule);
  if (last && date > last) return false;
  return schedule.repeat_days.includes(isoWeekday(date));
}

/** Scheduled dates in [from, to] (inclusive), capped at `limit`. */
export function scheduledDatesBetween(
  schedule: RoutineSchedule,
  from: ISODate,
  to: ISODate,
  limit = 400,
): ISODate[] {
  const start = from > schedule.starts_on ? from : schedule.starts_on;
  const last = lastPossibleDate(schedule);
  const end = last && last < to ? last : to;
  const dates: ISODate[] = [];
  for (let date = start; date <= end && dates.length < limit; date = addDays(date, 1)) {
    if (schedule.repeat_days.includes(isoWeekday(date))) dates.push(date);
  }
  return dates;
}

/** First scheduled date on or after `from`, or null if the routine has ended/paused. */
export function nextScheduledDate(schedule: RoutineSchedule, from: ISODate): ISODate | null {
  const start = from > schedule.starts_on ? from : schedule.starts_on;
  return scheduledDatesBetween(schedule, start, addDays(start, 6), 1)[0] ?? null;
}

export interface HistoryDay {
  date: ISODate;
  scheduled: boolean;
  completed: boolean;
}

/** The last `days` days ending on `today` (oldest first) with scheduled/completed flags. */
export function routineHistory(
  schedule: RoutineSchedule,
  completedDates: ReadonlySet<ISODate>,
  today: ISODate,
  days = 7,
): HistoryDay[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    return { date, scheduled: isScheduledOn(schedule, date), completed: completedDates.has(date) };
  });
}

/** "08:30:00" → "8:30 AM". */
export function formatReminderTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2]!;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}
