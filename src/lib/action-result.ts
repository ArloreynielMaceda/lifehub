import { z } from "zod";

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: FieldErrors): { ok: false; error: string; fieldErrors?: FieldErrors } {
  return { ok: false, error, fieldErrors };
}

export function validationFailure(error: z.ZodError): { ok: false; error: string; fieldErrors: FieldErrors } {
  return {
    ok: false,
    error: "Please check the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as FieldErrors,
  };
}

export const SESSION_EXPIRED = "Your session has expired. Please sign in again.";
export const GENERIC_ERROR = "Something went wrong. Please try again.";
