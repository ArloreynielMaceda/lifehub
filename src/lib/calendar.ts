import { addDays, endOfMonth, startOfMonth, startOfWeek, type ISODate } from "@/lib/dates";

/** Monday-first weeks covering the month that contains `month`. */
export function calendarGrid(month: ISODate): { start: ISODate; end: ISODate; days: ISODate[] } {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const start = startOfWeek(first);
  const days: ISODate[] = [];
  for (let day = start; day <= last || days.length % 7 !== 0; day = addDays(day, 1)) days.push(day);
  return { start, end: days.at(-1)!, days };
}
