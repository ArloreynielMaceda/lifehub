import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { FieldErrors } from "@/lib/action-result";

/** Copies server-side validation errors onto React Hook Form fields. */
export function applyServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: FieldErrors | undefined,
): boolean {
  if (!fieldErrors) return false;
  let applied = false;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];
    if (message) {
      setError(field as Path<T>, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}
