import { describe, expect, it } from "vitest";

import {
  MAX_AMOUNT_MINOR,
  formatMoney,
  minorToDecimalString,
  minorToInputValue,
  parseMoneyToMinor,
  sumMinor,
} from "@/lib/money";

describe("parseMoneyToMinor", () => {
  it("parses peso amounts into centavos exactly", () => {
    expect(parseMoneyToMinor("1,234.56", "PHP")).toEqual({ ok: true, minor: 123456 });
    expect(parseMoneyToMinor("0.1", "PHP")).toEqual({ ok: true, minor: 10 });
    expect(parseMoneyToMinor(".05", "PHP")).toEqual({ ok: true, minor: 5 });
    expect(parseMoneyToMinor("  250 ", "PHP")).toEqual({ ok: true, minor: 25000 });
    expect(parseMoneyToMinor("19.", "PHP")).toEqual({ ok: true, minor: 1900 });
  });

  it("avoids floating-point rounding errors", () => {
    // 0.1 + 0.2 style inputs and amounts that are inexact in binary floating point
    expect(parseMoneyToMinor("0.29", "PHP")).toEqual({ ok: true, minor: 29 });
    expect(parseMoneyToMinor("1.15", "PHP")).toEqual({ ok: true, minor: 115 });
    expect(parseMoneyToMinor("4.35", "USD")).toEqual({ ok: true, minor: 435 });
  });

  it("respects zero-decimal currencies", () => {
    expect(parseMoneyToMinor("1500", "JPY")).toEqual({ ok: true, minor: 1500 });
    expect(parseMoneyToMinor("1500.5", "JPY").ok).toBe(false);
  });

  it("rejects invalid input", () => {
    for (const input of ["", "abc", "-5", "1e3", "1.234", "12.3.4", "0", "0.00", "$5"]) {
      expect(parseMoneyToMinor(input, "PHP").ok, input).toBe(false);
    }
  });

  it("rejects amounts above the maximum", () => {
    expect(parseMoneyToMinor("9999999999.99", "PHP")).toEqual({ ok: true, minor: MAX_AMOUNT_MINOR });
    expect(parseMoneyToMinor("10000000000", "PHP").ok).toBe(false);
    expect(parseMoneyToMinor("99999999999999999999", "PHP").ok).toBe(false);
  });
});

describe("minorToDecimalString", () => {
  it("round-trips with the parser", () => {
    for (const minor of [1, 5, 10, 99, 100, 123456, MAX_AMOUNT_MINOR]) {
      const text = minorToDecimalString(minor, "PHP");
      expect(parseMoneyToMinor(text, "PHP")).toEqual({ ok: true, minor });
    }
  });

  it("formats small, negative and zero-decimal values", () => {
    expect(minorToDecimalString(5, "PHP")).toBe("0.05");
    expect(minorToDecimalString(-12345, "PHP")).toBe("-123.45");
    expect(minorToDecimalString(1500, "JPY")).toBe("1500");
    expect(minorToInputValue(null, "PHP")).toBe("");
  });
});

describe("formatMoney", () => {
  it("formats with the currency symbol", () => {
    expect(formatMoney(123456, "PHP")).toBe("₱1,234.56");
    expect(formatMoney(1500, "JPY")).toBe("¥1,500");
    expect(formatMoney(-500, "USD")).toBe("-$5.00");
    expect(formatMoney(500, "USD", { signDisplay: "always" })).toBe("+$5.00");
  });

  it("formats the largest amount without float rounding", () => {
    expect(formatMoney(MAX_AMOUNT_MINOR, "PHP")).toBe("₱9,999,999,999.99");
  });
});

describe("sumMinor", () => {
  it("sums exactly", () => {
    expect(sumMinor([10, 20, 30])).toBe(60);
    expect(sumMinor([])).toBe(0);
  });

  it("throws when leaving the safe integer range", () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});
