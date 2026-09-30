/**
 * Civil (calendar) date helpers.
 *
 * Due dates, transaction dates and recurrence anchors are calendar dates without a time or
 * time zone, represented as `YYYY-MM-DD` strings (the same shape Postgres returns for
 * `date` columns). All arithmetic below runs on UTC timestamps so results never depend on
 * the server's local time zone or daylight-saving transitions.
 */

export type ISODate = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    year >= 1900 &&
    year <= 2999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function parseISODate(value: ISODate): CivilDate {
  if (!isValidISODate(value)) {
    throw new RangeError(`Invalid ISO date: ${String(value)}`);
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

export function toISODate({ year, month, day }: CivilDate): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toUTCms(value: ISODate): number {
  const { year, month, day } = parseISODate(value);
  return Date.UTC(year, month - 1, day);
}

function fromUTCms(ms: number): ISODate {
  const date = new Date(ms);
  return toISODate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addDays(value: ISODate, days: number): ISODate {
  return fromUTCms(toUTCms(value) + days * DAY_MS);
}

/** Whole days from `b` to `a` (positive when `a` is later). */
export function diffInDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTCms(a) - toUTCms(b)) / DAY_MS);
}

/**
 * Adds calendar months, clamping the day to the end of the target month.
 * `preferredDay` lets recurrence keep the anchor's day (e.g. 31) across short months.
 */
export function addMonthsClamped(value: ISODate, months: number, preferredDay?: number): ISODate {
  const { year, month, day } = parseISODate(value);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  const targetDay = Math.min(preferredDay ?? day, daysInMonth(targetYear, targetMonth));
  return toISODate({ year: targetYear, month: targetMonth, day: targetDay });
}

/** Adds years; Feb 29 falls back to Feb 28 in common years. */
export function addYearsClamped(value: ISODate, years: number, preferredDay?: number): ISODate {
  return addMonthsClamped(value, years * 12, preferredDay);
}

/** Number of calendar months from `b` to `a`, ignoring the day of month. */
export function diffInCalendarMonths(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return (pa.year - pb.year) * 12 + (pa.month - pb.month);
}

export function compareISODate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISODate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISODate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function startOfMonth(value: ISODate): ISODate {
  const { year, month } = parseISODate(value);
  return toISODate({ year, month, day: 1 });
}

export function endOfMonth(value: ISODate): ISODate {
  const { year, month } = parseISODate(value);
  return toISODate({ year, month, day: daysInMonth(year, month) });
}

export function startOfYear(value: ISODate): ISODate {
  return toISODate({ year: parseISODate(value).year, month: 1, day: 1 });
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(value: ISODate): number {
  return new Date(toUTCms(value)).getUTCDay();
}

/** Monday-based start of the week containing `value`. */
export function startOfWeek(value: ISODate): ISODate {
  const dow = dayOfWeek(value);
  return addDays(value, dow === 0 ? -6 : 1 - dow);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The current calendar date in the given IANA time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return toISODate({ year: get("year"), month: get("month"), day: get("day") });
}

/** The current hour (0-23) in the given time zone, used for greetings. */
export function hourInTimeZone(timeZone: string, now: Date = new Date()): number {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(hour) % 24;
}

/**
 * Converts a civil date to a `Date` at UTC midnight. Format it with `timeZone: "UTC"` so the
 * displayed day never shifts.
 */
export function isoDateToUTCDate(value: ISODate): Date {
  return new Date(toUTCms(value));
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let instance = formatters.get(key);
  if (!instance) {
    instance = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
    formatters.set(key, instance);
  }
  return instance;
}

/** Formats a civil date deterministically (same output on server and client). */
export function formatISODate(
  value: ISODate,
  style: "short" | "medium" | "long" | "weekday" | "month" | "day" = "medium",
): string {
  const date = isoDateToUTCDate(value);
  switch (style) {
    case "short":
      return formatter({ month: "short", day: "numeric" }).format(date);
    case "long":
      return formatter({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
    case "weekday":
      return formatter({ weekday: "long", month: "long", day: "numeric" }).format(date);
    case "month":
      return formatter({ month: "long", year: "numeric" }).format(date);
    case "day":
      return formatter({ weekday: "short" }).format(date);
    default:
      return formatter({ month: "short", day: "numeric", year: "numeric" }).format(date);
  }
}

/** Human label relative to `today`: "Today", "Tomorrow", "Yesterday", "In 3 days", "5 days ago". */
export function relativeDayLabel(value: ISODate, today: ISODate): string {
  const diff = diffInDays(value, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 6) return `In ${diff} days`;
  if (diff < -1 && diff >= -30) return `${-diff} days ago`;
  const sameYear = parseISODate(value).year === parseISODate(today).year;
  return sameYear ? formatISODate(value, "short") : formatISODate(value, "medium");
}

/** `YYYY-MM` month key. */
export function monthKey(value: ISODate): string {
  return value.slice(0, 7);
}

export function isValidMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && isValidISODate(`${value}-01`);
}

/** Short relative label for a timestamp: "Just now", "5m ago", "3h ago", then a date. */
export function relativeTimeLabel(value: string | Date, timeZone: string, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return formatTimestamp(date, timeZone, "date");
}

/** Formats a timestamp (timestamptz) in the user's time zone. */
export function formatTimestamp(
  value: string | Date,
  timeZone: string,
  style: "date" | "datetime" | "time" = "datetime",
): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const date = typeof value === "string" ? new Date(value) : value;
  const options: Intl.DateTimeFormatOptions =
    style === "date"
      ? { month: "short", day: "numeric", year: "numeric" }
      : style === "time"
        ? { hour: "numeric", minute: "2-digit" }
        : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone }).format(date);
}
