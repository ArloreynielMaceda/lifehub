import {
  addDays,
  addMonthsClamped,
  diffInCalendarMonths,
  diffInDays,
  parseISODate,
  type ISODate,
} from "@/lib/dates";

/**
 * Recurrence engine for bills and reminders.
 *
 * Every occurrence is computed from the anchor (the first due date) by index, never by
 * chaining from the previous occurrence. That keeps month-end anchors stable:
 * Jan 31 → Feb 28 (29 in leap years) → Mar 31 → Apr 30, and a Feb 29 yearly anchor falls on
 * Feb 28 in common years and returns to Feb 29 in leap years.
 */

export const RECURRENCES = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

export const RECURRENCE_SHORT_LABELS: Record<Recurrence, string> = {
  none: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/** Hard cap so a bad input can never cause an unbounded loop. */
const MAX_ITERATIONS = 5000;

/** The occurrence at position `index` (0 = anchor). */
export function occurrenceAt(anchor: ISODate, recurrence: Recurrence, index: number): ISODate {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("Occurrence index must be a non-negative integer");
  }
  const anchorDay = parseISODate(anchor).day;
  switch (recurrence) {
    case "none":
      if (index !== 0) throw new RangeError("One-time items have a single occurrence");
      return anchor;
    case "daily":
      return addDays(anchor, index);
    case "weekly":
      return addDays(anchor, index * 7);
    case "monthly":
      return addMonthsClamped(anchor, index, anchorDay);
    case "yearly":
      return addMonthsClamped(anchor, index * 12, anchorDay);
  }
}

/** Smallest occurrence index whose date is on or after `date`. Returns null if none exists. */
export function firstIndexOnOrAfter(
  anchor: ISODate,
  recurrence: Recurrence,
  date: ISODate,
): number | null {
  if (date <= anchor) return 0;
  if (recurrence === "none") return null;

  let index: number;
  switch (recurrence) {
    case "daily":
      return diffInDays(date, anchor);
    case "weekly":
      return Math.ceil(diffInDays(date, anchor) / 7);
    case "monthly":
      index = Math.max(0, diffInCalendarMonths(date, anchor) - 1);
      break;
    case "yearly":
      index = Math.max(0, Math.floor(diffInCalendarMonths(date, anchor) / 12) - 1);
      break;
  }

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    if (occurrenceAt(anchor, recurrence, index) >= date) return index;
    index += 1;
  }
  throw new Error("Recurrence search exceeded iteration limit");
}

/** First occurrence strictly after `after`, or null for completed one-time items. */
export function nextOccurrenceAfter(
  anchor: ISODate,
  recurrence: Recurrence,
  after: ISODate,
): ISODate | null {
  const index = firstIndexOnOrAfter(anchor, recurrence, addDays(after, 1));
  return index === null ? null : occurrenceAt(anchor, recurrence, index);
}

/** First occurrence on or after `date`. */
export function occurrenceOnOrAfter(
  anchor: ISODate,
  recurrence: Recurrence,
  date: ISODate,
): ISODate | null {
  const index = firstIndexOnOrAfter(anchor, recurrence, date);
  return index === null ? null : occurrenceAt(anchor, recurrence, index);
}

/** All occurrences within [from, to] (inclusive), capped at `limit`. */
export function occurrencesBetween(
  anchor: ISODate,
  recurrence: Recurrence,
  from: ISODate,
  to: ISODate,
  limit = 400,
): ISODate[] {
  if (to < from) return [];
  const start = firstIndexOnOrAfter(anchor, recurrence, from);
  if (start === null) return [];
  const result: ISODate[] = [];
  for (let index = start; result.length < limit; index += 1) {
    if (recurrence === "none" && index > 0) break;
    const date = occurrenceAt(anchor, recurrence, index);
    if (date > to) break;
    result.push(date);
  }
  return result;
}

/** Whether `date` is exactly one of the item's occurrences. */
export function isOccurrence(anchor: ISODate, recurrence: Recurrence, date: ISODate): boolean {
  return occurrenceOnOrAfter(anchor, recurrence, date) === date;
}
