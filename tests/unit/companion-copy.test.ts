import { describe, expect, it } from "vitest";

import { billNudge } from "@/features/bills/nudge";
import {
  MOMENT_COMPANION,
  MOMENT_POSE,
  dashboardMoment,
  dashboardSummary,
  timeOfDay,
  type DayProgress,
} from "@/features/dashboard/moment";
import { moneyInsight } from "@/features/transactions/insight";
import { formatMoney } from "@/lib/money";
import type { MoneyOverview } from "@/lib/money-overview";

const day = (overrides: Partial<DayProgress> = {}): DayProgress => ({
  hour: 10,
  tasksDueToday: 0,
  overdue: 0,
  tasksDoneToday: 0,
  routinesScheduled: 0,
  routinesLeft: 0,
  billsComingUp: 0,
  ...overrides,
});

describe("dashboard companion", () => {
  it("follows the time of day: morning, afternoon, evening, night", () => {
    expect([5, 11, 12, 17, 18, 21, 22, 0, 4].map(timeOfDay)).toEqual([
      "morning",
      "morning",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
      "night",
      "night",
      "night",
    ]);
    expect(dashboardMoment(day({ hour: 8 }))).toBe("morning");
    expect(dashboardMoment(day({ hour: 14 }))).toBe("afternoon");
    expect(dashboardMoment(day({ hour: 19 }))).toBe("evening");
    expect(dashboardMoment(day({ hour: 23 }))).toBe("night");
    expect(MOMENT_POSE).toMatchObject({ morning: "goodmorning", afternoon: "goodafternoon", evening: "goodevening", night: "night" });
    expect(MOMENT_COMPANION).toMatchObject({
      morning: { badge: "sunrise" },
      afternoon: { badge: "sun" },
      evening: { badge: "sunset" },
      night: { mood: "sleepy", badge: "moon" },
    });
  });

  it("summarises what's left", () => {
    const p = day({ tasksDueToday: 2, routinesScheduled: 3, routinesLeft: 1, billsComingUp: 1 });
    expect(dashboardSummary(p)).toBe("You have 2 tasks due today, 1 routine to do, 1 bill coming up.");
  });

  it("calls out overdue work calmly during the day", () => {
    expect(dashboardMoment(day({ overdue: 1 }))).toBe("focus");
    expect(MOMENT_POSE.focus).toBe("reminder");
    expect(MOMENT_COMPANION.focus).toMatchObject({ mood: "calm", badge: "bell" });
  });

  it("celebrates only when something was planned and all of it is done", () => {
    const done = day({ tasksDoneToday: 2, routinesScheduled: 2, routinesLeft: 0 });
    expect(dashboardMoment(done)).toBe("all-done");
    expect(MOMENT_POSE["all-done"]).toBe("celebrate");
    expect(MOMENT_COMPANION["all-done"]).toMatchObject({ sparkles: true });
    expect(dashboardSummary(done)).toBe("Everything for today is done. Nice work.");
    expect(dashboardSummary({ ...done, billsComingUp: 2 })).toBe("Everything for today is done. 2 bills coming up.");
    expect(dashboardSummary({ ...done, hour: 19 })).toBe("Everything for today is done. Enjoy your evening.");

    const empty = day();
    expect(dashboardMoment(empty)).toBe("morning");
    expect(dashboardSummary(empty)).toBe("Nothing urgent today. A good moment to plan ahead.");
  });

  it("winds down at night, whatever is left", () => {
    expect(dashboardMoment(day({ hour: 23, overdue: 2 }))).toBe("night");
    expect(dashboardMoment(day({ hour: 1, tasksDoneToday: 1 }))).toBe("night");
    expect(dashboardSummary(day({ hour: 22 }))).toBe("Nothing left for today. Time to rest.");
    expect(dashboardSummary(day({ hour: 20 }))).toBe("Nothing left for today. Enjoy your evening.");
    expect(dashboardSummary(day({ hour: 23, tasksDoneToday: 1 }))).toBe("Everything for today is done. Rest well.");
  });
});

const overview = (overrides: Partial<MoneyOverview> = {}): MoneyOverview => ({
  currency: "PHP",
  income: 0,
  paidBills: 0,
  otherExpenses: 0,
  spent: 0,
  availableNow: 0,
  upcomingBills: 0,
  upcomingCount: 0,
  afterUpcoming: 0,
  hasActivity: false,
  ...overrides,
});
const php = (minor: number) => formatMoney(minor, "PHP");

describe("finance insight", () => {
  it("says what's left after upcoming bills", () => {
    const o = overview({ income: 5_000_000, spent: 2_000_000, availableNow: 3_000_000, upcomingBills: 500_000, upcomingCount: 2, afterUpcoming: 2_500_000, hasActivity: true });
    expect(moneyInsight(o, true)).toEqual({
      tone: "default",
      text: `After your 2 unpaid bills (${php(500_000)}), you'll still have ${php(2_500_000)}.`,
    });
    expect(moneyInsight({ ...o, upcomingCount: 3, afterUpcoming: -1 }, true)?.text).toMatch(/^Your 3 unpaid bills (.+) add up to /);
  });

  it("warns when upcoming bills exceed what's available", () => {
    const o = overview({ availableNow: 100_000, upcomingBills: 350_000, upcomingCount: 1, afterUpcoming: -250_000, hasActivity: true });
    expect(moneyInsight(o, true)).toEqual({
      tone: "warning",
      text: `Your unpaid bill (${php(350_000)}) is ${php(250_000)} more than you have available now.`,
    });
  });

  it("uses spending vs income for past periods", () => {
    const o = overview({ income: 4_000_000, spent: 1_000_000, availableNow: 3_000_000, upcomingCount: 3, hasActivity: true });
    expect(moneyInsight(o, false)?.text).toBe(`You've spent 25% of this period's income, so ${php(3_000_000)} is still available.`);
    expect(moneyInsight({ ...o, spent: 5_000_000 }, false)).toMatchObject({ tone: "warning" });
    expect(moneyInsight({ ...o, spent: 0 }, false)?.text).toMatch(/^Nothing spent yet/);
    expect(moneyInsight(overview({ spent: 120_000, hasActivity: true }), false)?.text).toMatch(/no income recorded/);
  });

  it("stays quiet without data", () => {
    expect(moneyInsight(overview(), true)).toBeNull();
  });
});

describe("bill nudge", () => {
  const today = "2026-10-02";
  const bill = { title: "Electricity", kind: "bill" as const, amount_minor: 210_000, currency: "PHP" };

  it("names the overdue bill, and how many others", () => {
    expect(billNudge({ ...bill, next_due_date: "2026-09-28" }, today, 1)).toEqual({
      mood: "surprised",
      tone: "warning",
      urgent: true,
      text: `Electricity (${php(210_000)}) is overdue. It was due Sep 28.`,
    });
    expect(billNudge({ ...bill, next_due_date: "2026-09-28" }, today, 3)?.text).toBe(
      `Electricity (${php(210_000)}) and 2 more are overdue. Mark them paid, or skip the ones that don't apply.`,
    );
  });

  it("reminds about today, tomorrow and this week", () => {
    expect(billNudge({ ...bill, next_due_date: today }, today, 0)?.text).toBe(`Electricity (${php(210_000)}) is due today.`);
    expect(billNudge({ ...bill, next_due_date: "2026-10-03" }, today, 0)?.text).toMatch(/due tomorrow\.$/);
    expect(billNudge({ ...bill, next_due_date: "2026-10-06" }, today, 0)?.text).toMatch(/due Tuesday, October 6\.$/);
    expect(billNudge({ ...bill, next_due_date: "2026-10-20" }, today, 0)).toMatchObject({ mood: "happy", urgent: false });
  });

  it("only overdue, today and tomorrow get the larger reminder banner", () => {
    const urgent = (date: string) => billNudge({ ...bill, next_due_date: date }, today, 0)?.urgent;
    expect([urgent("2026-09-30"), urgent(today), urgent("2026-10-03"), urgent("2026-10-04"), urgent("2026-11-01")]).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("omits amounts for reminders and stays quiet with nothing due", () => {
    expect(billNudge({ ...bill, kind: "reminder", next_due_date: today }, today, 0)?.text).toBe("Electricity is due today.");
    expect(billNudge(null, today, 0)).toBeNull();
  });
});
