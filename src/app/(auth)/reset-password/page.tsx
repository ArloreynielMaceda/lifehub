import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Button } from "@/components/ui/button";
import { restartPasswordReset } from "@/features/auth/actions";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { getSessionUser } from "@/lib/auth";
import { isRecentlyAuthenticated } from "@/lib/auth-recency";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  await connection();
  // The recovery link signs the user in with a short-lived session before landing here.
  const user = isSupabaseConfigured() ? await getSessionUser() : null;

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-4xl">Link expired</h1>
          <p className="text-sm text-muted-foreground">
            Password reset links can only be used once and expire after a short time. Request a new
            one to continue.
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  // A session that isn't fresh from a reset link (or a sign-in moments ago) can't set a
  // password without the current one; that goes through Settings instead.
  if (!isRecentlyAuthenticated(user.authenticatedAt)) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-4xl">Use a fresh link</h1>
          <p className="text-sm text-muted-foreground">
            For your security, a password can only be set here within 15 minutes of opening a reset link.
            If you know your current password, change it in Settings instead.
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/settings#security">Change it in Settings</Link>
        </Button>
        <form action={restartPasswordReset} className="text-center text-sm text-muted-foreground">
          Forgot your current password?{" "}
          <button type="submit" className="font-medium text-primary hover:underline">
            Sign out and send a new link
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-4xl">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re resetting the password for{" "}
          <span className="font-medium text-foreground">{user.email}</span>.
        </p>
      </div>
      <ResetPasswordForm submitLabel="Save new password" />
    </div>
  );
}
