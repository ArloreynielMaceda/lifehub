import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonthsClamped,
  daysInMonth,
  diffInDays,
  endOfMonth,
  formatISODate,
  hourInTimeZone,
  isLeapYear,
  isValidISODate,
  isValidMonthKey,
  relativeDayLabel,
  startOfWeek,
  todayInTimeZone,
} from "@/lib/dates";

describe("calendar basics", () => {
  it("knows leap years and month lengths", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("validates ISO dates strictly", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2024-02-29")).toBe(true);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-1-01")).toBe(false);
    expect(isValidISODate("not a date")).toBe(false);
    expect(isValidISODate(20260101)).toBe(false);
    expect(isValidMonthKey("2026-09")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
  });

  it("does day and month arithmetic without DST drift", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST start
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US DST end
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(diffInDays("2027-01-01", "2026-01-01")).toBe(365);
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(startOfWeek("2026-09-30")).toBe("2026-09-28"); // Wednesday → Monday
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // Sunday → previous Monday
  });
});

describe("time zones", () => {
  // 2026-09-30T20:30:00Z is already Oct 1 in Manila (UTC+8) but still Sep 30 in New York.
  const instant = new Date("2026-09-30T20:30:00Z");

  it("computes today in the user's time zone", () => {
    expect(todayInTimeZone("Asia/Manila", instant)).toBe("2026-10-01");
    expect(todayInTimeZone("America/New_York", instant)).toBe("2026-09-30");
    expect(todayInTimeZone("Pacific/Kiritimati", instant)).toBe("2026-10-01"); // UTC+14
    expect(todayInTimeZone("Pacific/Pago_Pago", instant)).toBe("2026-09-30"); // UTC-11
  });

  it("falls back to UTC for unknown zones", () => {
    expect(todayInTimeZone("Not/AZone", instant)).toBe("2026-09-30");
  });

  it("computes the local hour", () => {
    expect(hourInTimeZone("Asia/Manila", instant)).toBe(4);
    expect(hourInTimeZone("UTC", instant)).toBe(20);
  });
});

describe("formatting", () => {
  it("formats civil dates without shifting the day", () => {
    expect(formatISODate("2026-01-01", "medium")).toBe("Jan 1, 2026");
    expect(formatISODate("2026-09-30", "weekday")).toBe("Wednesday, September 30");
    expect(formatISODate("2026-09-30", "month")).toBe("September 2026");
  });

  it("labels days relative to today", () => {
    const today = "2026-09-30";
    expect(relativeDayLabel("2026-09-30", today)).toBe("Today");
    expect(relativeDayLabel("2026-10-01", today)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-09-29", today)).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-03", today)).toBe("In 3 days");
    expect(relativeDayLabel("2026-09-25", today)).toBe("5 days ago");
    expect(relativeDayLabel("2026-12-25", today)).toBe("Dec 25");
    expect(relativeDayLabel("2027-01-15", today)).toBe("Jan 15, 2027");
  });
});
