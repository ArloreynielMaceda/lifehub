import { z } from "zod";

import {
  addMonthsClamped,
  diffInDays,
  endOfMonth,
  isValidISODate,
  parseISODate,
  startOfMonth,
  startOfYear,
  type ISODate,
} from "@/lib/dates";
import { parseMoneyToMinor } from "@/lib/money";
import { isoDateSchema, one, type RawSearchParams } from "@/lib/validation";

import { PAYMENT_METHODS, RANGE_PRESETS, TRANSACTION_TYPES, type RangePreset } from "./constants";

export function transactionFormSchema(currency: string) {
  return z.object({
    type: z.enum(TRANSACTION_TYPES),
    amount: z
      .string()
      .trim()
      .max(20, "Amount is too long")
      .superRefine((value, ctx) => {
        const parsed = parseMoneyToMinor(value, currency);
        if (!parsed.ok) ctx.addIssue({ code: "custom", message: parsed.error });
      }),
    description: z.string().trim().min(1, "Add a short description").max(200, "Keep it under 200 characters"),
    category: z.string().trim().min(1, "Choose or type a category").max(50, "Keep the category under 50 characters"),
    paymentMethod: z.enum(PAYMENT_METHODS),
    occurredOn: isoDateSchema,
  });
}

export type TransactionFormValues = z.input<ReturnType<typeof transactionFormSchema>>;

export interface DateRange {
  preset: RangePreset;
  from: ISODate;
  to: ISODate;
  label: string;
}

const MAX_RANGE_DAYS = 366 * 5;

/** Resolves the preset or custom range (default: this month in the user's time zone). */
export function resolveRange(params: RawSearchParams, today: ISODate): DateRange {
  const presetRaw = one(params.range);
  const preset = (RANGE_PRESETS as readonly string[]).includes(presetRaw ?? "")
    ? (presetRaw as RangePreset)
    : "this_month";
  const from = one(params.from);
  const to = one(params.to);

  if (preset === "custom" && isValidISODate(from) && isValidISODate(to)) {
    const [start, end] = from <= to ? [from, to] : [to, from];
    if (diffInDays(end, start) <= MAX_RANGE_DAYS) {
      return { preset, from: start, to: end, label: "Custom range" };
    }
  }

  switch (preset) {
    case "last_month": {
      const lastMonth = addMonthsClamped(today, -1);
      return { preset, from: startOfMonth(lastMonth), to: endOfMonth(lastMonth), label: "Last month" };
    }
    case "last_3_months":
      return {
        preset,
        from: startOfMonth(addMonthsClamped(today, -2)),
        to: endOfMonth(today),
        label: "Last 3 months",
      };
    case "this_year":
      return {
        preset,
        from: startOfYear(today),
        to: `${parseISODate(today).year}-12-31`,
        label: "This year",
      };
    default:
      return { preset: "this_month", from: startOfMonth(today), to: endOfMonth(today), label: "This month" };
  }
}

const transactionFiltersSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  type: z.enum(TRANSACTION_TYPES).optional().catch(undefined),
  category: z.string().trim().max(50).optional().catch(undefined),
});

export type TransactionFilters = z.output<typeof transactionFiltersSchema>;

export function parseTransactionFilters(params: RawSearchParams): TransactionFilters {
  return transactionFiltersSchema.parse({
    q: one(params.q) ?? "",
    type: one(params.type) || undefined,
    category: one(params.category) || undefined,
  });
}
