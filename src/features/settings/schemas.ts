import { z } from "zod";

import { isValidTimeZone } from "@/lib/dates";
import { CURRENCY_CODES } from "@/lib/money";

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(100, "Keep your name under 100 characters"),
});

export const preferencesSchema = z.object({
  currency: z.enum(CURRENCY_CODES as [string, ...string[]], "Choose a supported currency"),
  timezone: z.string().max(64).refine(isValidTimeZone, "Choose a valid time zone"),
  emailReminders: z.boolean(),
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE", "Type DELETE to confirm"),
});

export type ProfileValues = z.input<typeof profileSchema>;
export type PreferencesValues = z.input<typeof preferencesSchema>;
