"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert, PasswordInput, SubmitButton } from "@/components/shared/form-bits";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { applyServerErrors } from "@/lib/forms";

import { updatePassword } from "../actions";
import { resetPasswordSchema } from "../schemas";

export function ResetPasswordForm({
  submitLabel = "Update password",
  redirectTo = "/dashboard",
  onDone,
}: {
  submitLabel?: string;
  redirectTo?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (!result.ok) {
        applyServerErrors(form.setError, result.fieldErrors);
        setServerError(result.error);
        return;
      }
      toast.success(result.message ?? "Password updated");
      form.reset();
      onDone?.();
      if (redirectTo) router.replace(redirectTo);
    });
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4">
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
      <SubmitButton pending={pending} pendingLabel="Saving…" className="w-full sm:w-auto">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
