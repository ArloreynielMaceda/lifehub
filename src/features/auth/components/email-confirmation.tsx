import { ArrowRight, TimerOff } from "lucide-react";
import Link from "next/link";

import { Companion } from "@/components/companion/companion";
import { Button } from "@/components/ui/button";

import { ResendVerificationForm } from "./resend-verification";
import { SignupSteps } from "./signup-steps";

function StatusHeader({
  tone,
  title,
  celebrate = false,
  children,
}: {
  tone: "success" | "warning";
  title: string;
  /** The first moment of a new account: the companion welcomes them. */
  celebrate?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {tone === "success" ? (
        <Companion mood="happy" badge="check" sparkles={celebrate} size="md" className="lg:hidden" />
      ) : (
        <div className="flex size-11 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <TimerOff className="size-5" aria-hidden="true" />
        </div>
      )}
      <div className="space-y-2">
        <h1 className="font-display text-4xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

/** The link was opened in the browser that signed up: the user is confirmed and signed in. */
export function EmailConfirmed({ name, email }: { name: string; email: string | null }) {
  return (
    <div className="space-y-6">
      <StatusHeader tone="success" title="Email confirmed" celebrate>
        Welcome to LifeHub, {name}. Your account is now active and you&apos;re signed in.
      </StatusHeader>
      <SignupSteps current={3} />
      <Button asChild size="lg" className="w-full">
        <Link href="/dashboard">
          Go to my dashboard
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      {email ? (
        <p className="text-center text-xs text-muted-foreground">
          Confirmed address: <span className="break-all">{email}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Supabase confirmed the address, but the link was opened in a different browser or app
 * from the one used to sign up, so there is no session here yet.
 */
export function ConfirmedInOtherBrowser() {
  return (
    <div className="space-y-6">
      <StatusHeader tone="success" title="Email confirmed">
        Your account is active. You opened the link in a different browser or app from the one you
        signed up in, so sign in here to continue.
      </StatusHeader>
      <SignupSteps current={3} />
      <Button asChild size="lg" className="w-full">
        <Link href="/login">
          Sign in to LifeHub
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

/** Expired, already used or malformed link. */
export function ConfirmationLinkExpired() {
  return (
    <div className="space-y-6">
      <StatusHeader tone="warning" title="This link has expired">
        Confirmation links work once and expire after 1 hour. If you&apos;ve already confirmed your
        email, just sign in. Otherwise, enter your email and we&apos;ll send a new link.
      </StatusHeader>
      <ResendVerificationForm />
      <p className="border-t pt-4 text-center text-sm text-muted-foreground">
        Already confirmed?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
