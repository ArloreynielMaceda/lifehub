"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Companion } from "@/components/companion/companion";
import {
  FormAlert,
  PasswordInput,
  SubmitButton,
} from "@/components/shared/form-bits";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyServerErrors } from "@/lib/forms";

import { checkEmailConfirmed, signUp } from "../actions";
import { RESEND_COOLDOWN_SECONDS, VERIFY_EMAIL_PATH } from "../paths";
import { signUpSchema } from "../schemas";
import { ResendVerification } from "./resend-verification";
import { SignupSteps } from "./signup-steps";

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const TIPS = [
  "Not in your inbox? Check spam or promotions.",
  "The link works once and expires after 1 hour.",
  "Opening it on another device is fine. You'll just sign in afterwards.",
];

/** Shown after sign-up: the account exists but stays inactive until the email is confirmed. */
function ConfirmEmailPending({
  email,
  onChangeEmail,
}: {
  email: string;
  onChangeEmail: () => void;
}) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Opening the link in another tab of this browser signs the user in there. When they come
  // back to this tab, take it to the confirmation page as well.
  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        if (await checkEmailConfirmed()) router.replace(VERIFY_EMAIL_PATH);
      } catch {
        // Offline or a hiccup: try again the next time the tab is focused.
      } finally {
        checking = false;
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <MailCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-4xl outline-none"
          >
            Confirm your email
          </h1>
          <p className="text-sm text-muted-foreground">
            We sent a link to{" "}
            <span className="font-medium break-all text-foreground">
              {email}
            </span>
            . Your account isn&apos;t active, and you can&apos;t sign in, until
            you open it.
          </p>
        </div>
      </div>
      <SignupSteps current={2} />
      <ResendVerification
        email={email}
        initialCooldown={RESEND_COOLDOWN_SECONDS}
        className="w-full"
      />
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {TIPS.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span
              className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60"
              aria-hidden="true"
            />
            {tip}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4 text-sm">
        <button
          type="button"
          onClick={onChangeEmail}
          className="font-medium text-primary hover:underline"
        >
          Wrong email? Change it
        </button>
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Already confirmed? Sign in
        </Link>
      </div>
    </div>
  );
}

export function SignupForm({ configured }: { configured: boolean }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
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
      <ConfirmEmailPending
        email={sentTo}
        onChangeEmail={() => {
          form.resetField("password");
          form.resetField("confirmPassword");
          setSentTo(null);
        }}
      />
    );
  }

  const { errors } = form.formState;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Companion mood="welcome" size="md" className="mb-3 lg:hidden" />
        <h1 className="font-display text-4xl">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Free to start. Your data stays private to you.
        </p>
      </div>
      {!configured ? (
        <FormAlert message="LifeHub isn't connected to Supabase yet. See the README to finish setup." />
      ) : null}
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
              aria-describedby={
                errors.confirmPassword ? "confirmPassword-error" : undefined
              }
              {...form.register("confirmPassword")}
            />
            <FieldError
              id="confirmPassword-error"
              errors={[errors.confirmPassword]}
            />
          </Field>
        </FieldGroup>
        <SubmitButton
          pending={pending}
          pendingLabel="Creating account…"
          size="lg"
          className="w-full"
        >
          Create account
        </SubmitButton>
        <p className="text-center text-xs text-muted-foreground">
          By creating an account you agree to our{" "}
          <Link
            href="/terms"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
