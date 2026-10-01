"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert, SubmitButton } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { resendVerification } from "../actions";
import { RESEND_COOLDOWN_SECONDS } from "../paths";
import { emailSchema } from "../schemas";

/** Seconds left before another email can be requested; counts down to zero. */
function useCooldown(initialSeconds = 0) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return [seconds, setSeconds] as const;
}

/** Resends the confirmation email to a known address, at most once a minute. */
export function ResendVerification({
  email,
  className,
  initialCooldown = 0,
}: {
  email: string;
  className?: string;
  /** Start counting down straight away, e.g. right after sign-up sent the first email. */
  initialCooldown?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [cooldown, setCooldown] = useCooldown(initialCooldown);

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={pending || cooldown > 0}
      onClick={() =>
        startTransition(async () => {
          const result = await resendVerification(email);
          if (result.ok) {
            setCooldown(RESEND_COOLDOWN_SECONDS);
            toast.success(result.message ?? "Confirmation email sent.");
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {pending ? <Spinner aria-hidden="true" /> : null}
      {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend confirmation email"}
    </Button>
  );
}

/** For when the address isn't known yet, e.g. after an expired link. */
export function ResendVerificationForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cooldown, setCooldown] = useCooldown();

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setServerError(null);
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) {
          setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
          return;
        }
        setFieldError(null);
        startTransition(async () => {
          const result = await resendVerification(parsed.data);
          if (result.ok) {
            setSent(result.message ?? "A new confirmation link is on its way.");
            setCooldown(RESEND_COOLDOWN_SECONDS);
          } else {
            setServerError(result.error);
          }
        });
      }}
    >
      <FormAlert tone="success" message={sent} />
      <FormAlert message={serverError} />
      <Field data-invalid={!!fieldError}>
        <FieldLabel htmlFor="resend-email">Email</FieldLabel>
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={!!fieldError}
          aria-describedby={fieldError ? "resend-email-error" : undefined}
        />
        <FieldError id="resend-email-error" errors={fieldError ? [{ message: fieldError }] : undefined} />
      </Field>
      <SubmitButton pending={pending} pendingLabel="Sending…" disabled={cooldown > 0} size="lg" className="w-full">
        {cooldown > 0 ? `Send again in ${cooldown}s` : "Send a new link"}
      </SubmitButton>
    </form>
  );
}
