"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert, PasswordInput, SubmitButton } from "@/components/shared/form-bits";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { applyServerErrors } from "@/lib/forms";

import { changePassword } from "../actions";
import { changePasswordSchema } from "../schemas";

/** Settings → Password. Requires the current password; signs out other devices on success. */
export function ChangePasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await changePassword(values);
      if (!result) return; // redirected to sign in
      if (!result.ok) {
        applyServerErrors(form.setError, result.fieldErrors);
        setServerError(result.error);
        return;
      }
      toast.success(result.message ?? "Password changed");
      form.reset();
    });
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.currentPassword}>
          <FieldLabel htmlFor="current-password">Current password</FieldLabel>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            aria-describedby={errors.currentPassword ? "current-password-error" : undefined}
            {...form.register("currentPassword")}
          />
          <FieldError id="current-password-error" errors={[errors.currentPassword]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="new-password-help"
            {...form.register("password")}
          />
          {errors.password ? (
            <FieldError id="new-password-help" errors={[errors.password]} />
          ) : (
            <FieldDescription id="new-password-help">
              At least 8 characters, with a letter and a number.
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirm-new-password">Confirm new password</FieldLabel>
          <PasswordInput
            id="confirm-new-password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "confirm-new-password-error" : undefined}
            {...form.register("confirmPassword")}
          />
          <FieldError id="confirm-new-password-error" errors={[errors.confirmPassword]} />
        </Field>
      </FieldGroup>
      <p className="text-xs text-muted-foreground">Changing your password signs you out on your other devices.</p>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="w-full sm:w-auto">
        Change password
      </SubmitButton>
    </form>
  );
}
