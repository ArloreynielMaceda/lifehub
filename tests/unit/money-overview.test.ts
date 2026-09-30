import { describe, expect, it } from "vitest";

import { buildMoneyOverview, unpaidBillsUntil, type PlannedBill } from "@/lib/money-overview";

const bill = (overrides: Partial<PlannedBill>): PlannedBill => ({
  kind: "bill",
  status: "active",
  amount_minor: 100000,
  currency: "PHP",
  recurrence: "monthly",
  anchor_date: "2026-09-15",
  next_due_date: "2026-09-15",
  ...overrides,
});

describe("available money", () => {
  it("matches the worked example (₱30,000 income, ₱8,000 rent paid, ₱4,000 other)", () => {
    const upcoming = unpaidBillsUntil(
      [
        bill({ amount_minor: 150000, next_due_date: "2026-09-20", anchor_date: "2026-09-20" }), // Internet
        bill({ amount_minor: 230000, next_due_date: "2026-09-25", anchor_date: "2026-09-25" }), // Electricity
        bill({ amount_minor: 54900, next_due_date: "2026-09-28", anchor_date: "2026-09-28" }), // Netflix
        bill({ kind: "reminder", amount_minor: 999900 }), // reminders never count
        bill({ status: "completed", amount_minor: 800000 }), // rent: already paid
        bill({ amount_minor: null }), // no amount → nothing to project
        bill({ next_due_date: "2026-10-05", anchor_date: "2026-10-05" }), // next month
      ],
      "2026-09-30",
    );
    const overview = buildMoneyOverview(
      "PHP",
      { currency: "PHP", income_minor: 3000000, bill_expense_minor: 800000, other_expense_minor: 400000, tx_count: 3 },
      upcoming.get("PHP"),
    );
    expect(overview).toMatchObject({
      income: 3000000,
      paidBills: 800000,
      otherExpenses: 400000,
      spent: 1200000,
      availableNow: 1800000, // ₱18,000
      upcomingBills: 434900, // ₱4,349
      upcomingCount: 3,
      afterUpcoming: 1365100, // ₱13,651
    });
  });

  it("counts a paid bill once: unpaid bills never reduce available-now", () => {
    const withoutBills = buildMoneyOverview(
      "PHP",
      { currency: "PHP", income_minor: 500000, bill_expense_minor: 0, other_expense_minor: 100000, tx_count: 2 },
      { total: 200000, count: 1 },
    );
    expect(withoutBills.availableNow).toBe(400000);
    expect(withoutBills.afterUpcoming).toBe(200000);
  });

  it("handles an empty month", () => {
    expect(buildMoneyOverview("PHP", undefined, undefined)).toMatchObject({
      availableNow: 0,
      afterUpcoming: 0,
      hasActivity: false,
    });
  });
});

describe("upcoming bills", () => {
  it("counts every remaining occurrence of recurring bills in the period", () => {
    const weekly = bill({ recurrence: "weekly", anchor_date: "2026-09-02", next_due_date: "2026-09-16", amount_minor: 50000 });
    expect(unpaidBillsUntil([weekly], "2026-09-30").get("PHP")).toEqual({ total: 150000, count: 3 }); // 16, 23, 30
  });

  it("includes overdue occurrences and respects month-end anchors", () => {
    // Anchored Jan 31, unpaid since Feb 28: owes Feb 28 and Mar 31 by end of March.
    const rent = bill({ anchor_date: "2026-01-31", next_due_date: "2026-02-28", amount_minor: 800000 });
    expect(unpaidBillsUntil([rent], "2026-03-31").get("PHP")).toEqual({ total: 1600000, count: 2 });
    expect(unpaidBillsUntil([rent], "2026-03-30").get("PHP")).toEqual({ total: 800000, count: 1 });
  });

  it("keeps currencies separate", () => {
    const totals = unpaidBillsUntil(
      [bill({ currency: "PHP" }), bill({ currency: "USD", amount_minor: 1000 })],
      "2026-09-30",
    );
    expect(totals.get("PHP")).toEqual({ total: 100000, count: 1 });
    expect(totals.get("USD")).toEqual({ total: 1000, count: 1 });
  });
});
