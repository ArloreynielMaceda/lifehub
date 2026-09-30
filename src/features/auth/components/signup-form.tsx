"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { FormAlert, PasswordInput, SubmitButton } from "@/components/shared/form-bits";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyServerErrors } from "@/lib/forms";

import { signUp } from "../actions";
import { signUpSchema } from "../schemas";
import { ResendVerification } from "./resend-verification";

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signUp({ ...values, timezone: browserTimeZone() });
      if (!result) return; // redirected (email confirmation disabled)
      if (!result.ok) {
        applyServerErrors(form.setError, result.fieldErrors);
        setServerError(result.error);
        return;
      }
      setSentTo(result.data.email);
    });
  });

  if (sentTo) {
    return (
      <div className="space-y-5" role="status">
        <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <MailCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-3xl">Check your inbox</h2>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{sentTo}</span>.
            Open it to activate your account. The link expires in 24 hours.
          </p>
        </div>
        <ResendVerification email={sentTo} className="w-full" />
        <p className="text-center text-sm text-muted-foreground">
          Already confirmed?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="fullName">Your name</FieldLabel>
          <Input
            id="fullName"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
            {...form.register("fullName")}
          />
          <FieldError id="fullName-error" errors={[errors.fullName]} />
        </Field>
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
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="password-help"
            {...form.register("password")}
          />
          {errors.password ? (
            <FieldError id="password-help" errors={[errors.password]} />
          ) : (
            <FieldDescription id="password-help">
              At least 8 characters, with a letter and a number.
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
            {...form.register("confirmPassword")}
          />
          <FieldError id="confirmPassword-error" errors={[errors.confirmPassword]} />
        </Field>
      </FieldGroup>
      <SubmitButton pending={pending} pendingLabel="Creating account…" size="lg" className="w-full">
        Create account
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
