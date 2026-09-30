import { describe, expect, it } from "vitest";

import {
  isOccurrence,
  nextOccurrenceAfter,
  occurrenceAt,
  occurrenceOnOrAfter,
  occurrencesBetween,
} from "@/lib/recurrence";

describe("occurrenceAt", () => {
  it("keeps month-end anchors stable across short months", () => {
    const anchor = "2026-01-31";
    expect([0, 1, 2, 3, 4].map((i) => occurrenceAt(anchor, "monthly", i))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31", // not Mar 28: computed from the anchor, not chained
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("uses Feb 29 in leap years for a Jan 31 monthly anchor", () => {
    expect(occurrenceAt("2028-01-31", "monthly", 1)).toBe("2028-02-29");
  });

  it("handles Feb 29 yearly anchors in common and leap years", () => {
    const anchor = "2024-02-29";
    expect([1, 2, 3, 4].map((i) => occurrenceAt(anchor, "yearly", i))).toEqual([
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("handles century leap-year rules", () => {
    expect(occurrenceAt("2096-02-29", "yearly", 4)).toBe("2100-02-28"); // 2100 is not a leap year
  });

  it("crosses year boundaries for daily, weekly and monthly rules", () => {
    expect(occurrenceAt("2026-12-31", "daily", 1)).toBe("2027-01-01");
    expect(occurrenceAt("2026-12-28", "weekly", 1)).toBe("2027-01-04");
    expect(occurrenceAt("2026-11-30", "monthly", 3)).toBe("2027-02-28");
  });

  it("rejects invalid indexes", () => {
    expect(() => occurrenceAt("2026-01-01", "monthly", -1)).toThrow();
    expect(() => occurrenceAt("2026-01-01", "monthly", 1.5)).toThrow();
    expect(() => occurrenceAt("2026-01-01", "none", 1)).toThrow();
  });
});

describe("nextOccurrenceAfter", () => {
  it("returns the anchor when it is still in the future", () => {
    expect(nextOccurrenceAfter("2026-10-15", "monthly", "2026-09-30")).toBe("2026-10-15");
  });

  it("finds the next monthly occurrence after a paid one", () => {
    expect(nextOccurrenceAfter("2026-01-31", "monthly", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrenceAfter("2026-01-31", "monthly", "2026-03-31")).toBe("2026-04-30");
  });

  it("skips ahead correctly when many periods have passed", () => {
    expect(nextOccurrenceAfter("2020-01-31", "monthly", "2026-09-30")).toBe("2026-10-31");
    expect(nextOccurrenceAfter("2020-02-29", "yearly", "2026-03-01")).toBe("2027-02-28");
    expect(nextOccurrenceAfter("2026-01-01", "weekly", "2026-01-08")).toBe("2026-01-15");
    expect(nextOccurrenceAfter("2026-01-01", "daily", "2026-03-01")).toBe("2026-03-02");
  });

  it("returns null for a one-time item that has passed", () => {
    expect(nextOccurrenceAfter("2026-01-01", "none", "2026-01-01")).toBeNull();
  });

  it("always moves strictly forward", () => {
    const anchor = "2026-01-31";
    let current = anchor;
    for (let i = 0; i < 60; i += 1) {
      const next = nextOccurrenceAfter(anchor, "monthly", current)!;
      expect(next > current).toBe(true);
      current = next;
    }
    expect(current).toBe("2031-01-31");
  });
});

describe("occurrencesBetween", () => {
  it("lists occurrences inside an inclusive range", () => {
    expect(occurrencesBetween("2026-01-31", "monthly", "2026-02-01", "2026-05-31")).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("respects the limit and empty ranges", () => {
    expect(occurrencesBetween("2026-01-01", "daily", "2026-01-01", "2026-12-31", 3)).toHaveLength(3);
    expect(occurrencesBetween("2026-01-01", "daily", "2026-02-01", "2026-01-01")).toEqual([]);
    expect(occurrencesBetween("2026-06-01", "none", "2026-01-01", "2026-12-31")).toEqual(["2026-06-01"]);
  });
});

describe("occurrence checks", () => {
  it("identifies exact occurrences", () => {
    expect(isOccurrence("2026-01-31", "monthly", "2026-02-28")).toBe(true);
    expect(isOccurrence("2026-01-31", "monthly", "2026-02-27")).toBe(false);
    expect(occurrenceOnOrAfter("2026-01-05", "weekly", "2026-01-06")).toBe("2026-01-12");
  });
});
