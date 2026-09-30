import type { Metadata } from "next";
import Link from "next/link";

import { FormAlert } from "@/components/shared/form-bits";
import { SignupForm } from "@/features/auth/components/signup-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-4xl">Create your account</h1>
        <p className="text-sm text-muted-foreground">Free to start. Your data stays private to you.</p>
      </div>
      {!isSupabaseConfigured() ? (
        <FormAlert message="LifeHub isn't connected to Supabase yet. See the README to finish setup." />
      ) : null}
      <SignupForm />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
