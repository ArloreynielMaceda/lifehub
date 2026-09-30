import { z } from "zod";

import { isValidISODate, isValidMonthKey } from "@/lib/dates";

export const isoDateSchema = z.string().refine(isValidISODate, "Enter a valid date");

/** Empty string (no date) or a valid ISO date — matches `<input type="date">`. */
export const optionalIsoDateSchema = z.union([z.literal(""), isoDateSchema]);

export const idSchema = z.uuid("Invalid id");

export const monthKeySchema = z.string().refine(isValidMonthKey, "Invalid month");

type SearchParamValue = string | string[] | undefined;
export type RawSearchParams = Record<string, SearchParamValue>;

/** First value of a search param. */
export function one(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Flattens search params to single strings (for building links). */
export function flattenSearchParams(params: RawSearchParams): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, one(value)]));
}
