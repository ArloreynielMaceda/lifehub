"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { FormAlert, SubmitButton } from "@/components/shared/form-bits";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyServerErrors } from "@/lib/forms";

import { requestPasswordReset } from "../actions";
import { forgotPasswordSchema } from "../schemas";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result.ok) {
        setMessage({ tone: "success", text: result.message ?? "Check your email for a reset link." });
        form.reset();
      } else {
        applyServerErrors(form.setError, result.fieldErrors);
        setMessage({ tone: "error", text: result.error });
      }
    });
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert tone={message?.tone} message={message?.text} />
      <Field data-invalid={!!errors.email}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...form.register("email")}
        />
        <FieldError id="email-error" errors={[errors.email]} />
      </Field>
      <SubmitButton pending={pending} pendingLabel="Sending…" size="lg" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}
