import { z } from "zod";

import { newPasswordSchema } from "@/features/auth/schemas";
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

/** Re-entered to prove it's really the account owner before a sensitive change. */
const currentPasswordSchema = z.string().min(1, "Enter your current password").max(72, "Use at most 72 characters");

export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE", "Type DELETE to confirm"),
  password: currentPasswordSchema,
});

export type ProfileValues = z.input<typeof profileSchema>;
export type PreferencesValues = z.input<typeof preferencesSchema>;
export type ChangePasswordValues = z.input<typeof changePasswordSchema>;
