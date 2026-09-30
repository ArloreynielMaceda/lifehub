"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { FormAlert, PasswordInput, SubmitButton } from "@/components/shared/form-bits";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyServerErrors } from "@/lib/forms";

import { signIn } from "../actions";
import { signInSchema } from "../schemas";
import { ResendVerification } from "./resend-verification";

export function LoginForm({ next, notice }: { next?: string; notice?: { tone: "error" | "success"; message: string } }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", next },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    setUnverifiedEmail(null);
    startTransition(async () => {
      const result = await signIn(values);
      // On success the action redirects, so we only get here on failure.
      if (result && !result.ok) {
        applyServerErrors(form.setError, result.fieldErrors);
        setServerError(result.error);
        if (result.unverified) setUnverifiedEmail(String(values.email));
      }
    });
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {notice ? <FormAlert tone={notice.tone} message={notice.message} /> : null}
      <FormAlert message={serverError} />
      {unverifiedEmail ? <ResendVerification email={unverifiedEmail} /> : null}
      <FieldGroup className="gap-4">
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
        <Field data-invalid={!!errors.password}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...form.register("password")}
          />
          <FieldError id="password-error" errors={[errors.password]} />
        </Field>
      </FieldGroup>
      <SubmitButton pending={pending} pendingLabel="Signing in…" size="lg" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
