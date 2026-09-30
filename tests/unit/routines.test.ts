import { describe, expect, it } from "vitest";

import { todayInTimeZone } from "@/lib/dates";
import {
  describeRepeatDays,
  formatReminderTime,
  isScheduledOn,
  isoWeekday,
  nextScheduledDate,
  normalizeWeekdays,
  presetFor,
  routineHistory,
  scheduledDatesBetween,
  type RoutineSchedule,
} from "@/lib/routines";

const daily: RoutineSchedule = { repeat_days: [1, 2, 3, 4, 5, 6, 7], starts_on: "2026-09-01", ends_on: null, paused_on: null };
// 2026-09-28 is a Monday.
const mwf: RoutineSchedule = { repeat_days: [1, 3, 5], starts_on: "2026-09-28", ends_on: "2026-10-09", paused_on: null };

describe("weekdays", () => {
  it("uses ISO numbering (Monday = 1, Sunday = 7)", () => {
    expect(isoWeekday("2026-09-28")).toBe(1);
    expect(isoWeekday("2026-10-04")).toBe(7);
    expect(isoWeekday("2024-02-29")).toBe(4);
  });

  it("normalizes and describes schedules in plain words", () => {
    expect(normalizeWeekdays([5, 1, 3, 1, 9, 0])).toEqual([1, 3, 5]);
    expect(describeRepeatDays([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(describeRepeatDays([5, 4, 3, 2, 1])).toBe("Every weekday");
    expect(describeRepeatDays([6, 7])).toBe("Every weekend");
    expect(describeRepeatDays([1])).toBe("Every Monday");
    expect(describeRepeatDays([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(presetFor([1, 2, 3, 4, 5])).toBe("weekdays");
    expect(presetFor([2, 4])).toBe("custom");
  });
});

describe("daily recurrence", () => {
  it("is scheduled every day from the start date", () => {
    expect(isScheduledOn(daily, "2026-08-31")).toBe(false);
    expect(isScheduledOn(daily, "2026-09-01")).toBe(true);
    expect(scheduledDatesBetween(daily, "2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("crosses month-end and leap days without gaps", () => {
    const leap: RoutineSchedule = { ...daily, starts_on: "2028-02-27" };
    expect(scheduledDatesBetween(leap, "2028-02-27", "2028-03-01")).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });
});

describe("selected weekdays with start and end dates", () => {
  it("only occurs on chosen days inside the window", () => {
    expect(scheduledDatesBetween(mwf, "2026-09-20", "2026-10-31")).toEqual([
      "2026-09-28",
      "2026-09-30",
      "2026-10-02",
      "2026-10-05",
      "2026-10-07",
      "2026-10-09",
    ]);
    expect(isScheduledOn(mwf, "2026-09-29")).toBe(false); // Tuesday
    expect(isScheduledOn(mwf, "2026-10-12")).toBe(false); // after end
  });

  it("finds the next occurrence, or none after the end", () => {
    expect(nextScheduledDate(mwf, "2026-09-29")).toBe("2026-09-30");
    expect(nextScheduledDate(mwf, "2026-09-01")).toBe("2026-09-28"); // before start
    expect(nextScheduledDate(mwf, "2026-10-10")).toBeNull();
  });
});

describe("pausing", () => {
  it("stops occurrences from the pause date on and resumes when unpaused", () => {
    const paused = { ...daily, paused_on: "2026-09-30" };
    expect(isScheduledOn(paused, "2026-09-29")).toBe(true);
    expect(isScheduledOn(paused, "2026-09-30")).toBe(false);
    expect(nextScheduledDate(paused, "2026-09-30")).toBeNull();
    expect(isScheduledOn({ ...paused, paused_on: null }, "2026-10-05")).toBe(true);
  });
});

describe("history", () => {
  it("lists the last seven days with scheduled and completed flags", () => {
    const history = routineHistory(mwf, new Set(["2026-09-28", "2026-10-02"]), "2026-10-02");
    expect(history.map((d) => [d.date, d.scheduled, d.completed])).toEqual([
      ["2026-09-26", false, false],
      ["2026-09-27", false, false],
      ["2026-09-28", true, true],
      ["2026-09-29", false, false],
      ["2026-09-30", true, false],
      ["2026-10-01", false, false],
      ["2026-10-02", true, true],
    ]);
  });
});

describe("time zones and reminder labels", () => {
  it("decides 'today' per user time zone at date boundaries", () => {
    // 2026-09-27T20:30Z: already Monday in Manila, still Sunday in New York.
    const instant = new Date("2026-09-27T20:30:00Z");
    const weekdaysOnly: RoutineSchedule = { ...daily, repeat_days: [1, 2, 3, 4, 5] };
    expect(isScheduledOn(weekdaysOnly, todayInTimeZone("Asia/Manila", instant))).toBe(true);
    expect(isScheduledOn(weekdaysOnly, todayInTimeZone("America/New_York", instant))).toBe(false);
  });

  it("formats reminder times", () => {
    expect(formatReminderTime("08:30:00")).toBe("8:30 AM");
    expect(formatReminderTime("00:05")).toBe("12:05 AM");
    expect(formatReminderTime("12:00:00")).toBe("12:00 PM");
    expect(formatReminderTime("21:45:00")).toBe("9:45 PM");
    expect(formatReminderTime(null)).toBeNull();
  });
});
