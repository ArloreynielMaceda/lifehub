import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/lib/safe-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please request a new one.",
  not_configured: "LifeHub isn't connected to Supabase yet.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const next = safeNextPath(one(params.next));
  const error = one(params.error);
  const notice = !isSupabaseConfigured()
    ? { tone: "error" as const, message: ERROR_MESSAGES.not_configured! }
    : error && ERROR_MESSAGES[error]
      ? { tone: "error" as const, message: ERROR_MESSAGES[error]! }
      : one(params.signed_out) === "everywhere"
        ? { tone: "success" as const, message: "You've been signed out on all your devices." }
        : one(params.signed_out)
          ? { tone: "success" as const, message: "You've been signed out." }
          : one(params.password_changed)
            ? { tone: "success" as const, message: "Your password was changed. Please sign in with the new one." }
            : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-4xl">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to pick up where you left off.</p>
      </div>
      <LoginForm next={next} notice={notice} />
      <p className="text-center text-sm text-muted-foreground">
        New to LifeHub?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
