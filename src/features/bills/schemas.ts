import { z } from "zod";

import { parseMoneyToMinor } from "@/lib/money";
import { RECURRENCES } from "@/lib/recurrence";
import { isoDateSchema, one, type RawSearchParams } from "@/lib/validation";

import { BILL_KINDS, BILL_VIEWS } from "./constants";

/** The amount is optional; when present it must be valid for the bill's currency. */
export function billFormSchema(currency: string) {
  return z.object({
    kind: z.enum(BILL_KINDS),
    title: z.string().trim().min(1, "Give it a name").max(200, "Keep the name under 200 characters"),
    description: z.string().trim().max(2000, "Keep notes under 2,000 characters"),
    category: z.string().trim().max(50, "Keep the category under 50 characters"),
    amount: z
      .string()
      .trim()
      .max(20, "Amount is too long")
      .superRefine((value, ctx) => {
        if (value === "") return;
        const parsed = parseMoneyToMinor(value, currency);
        if (!parsed.ok) ctx.addIssue({ code: "custom", message: parsed.error });
      }),
    dueDate: isoDateSchema,
    recurrence: z.enum(RECURRENCES),
  });
}

export type BillFormValues = z.input<ReturnType<typeof billFormSchema>>;

const billFiltersSchema = z.object({
  view: z.enum(BILL_VIEWS).catch("upcoming"),
  kind: z.enum(BILL_KINDS).optional().catch(undefined),
  q: z.string().trim().max(100).catch(""),
});

export type BillFilters = z.output<typeof billFiltersSchema>;

export function parseBillFilters(params: RawSearchParams): BillFilters {
  return billFiltersSchema.parse({
    view: one(params.view),
    kind: one(params.kind) || undefined,
    q: one(params.q) ?? "",
  });
}
