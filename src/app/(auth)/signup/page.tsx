import type { Metadata } from "next";

import { SignupForm } from "@/features/auth/components/signup-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return <SignupForm configured={isSupabaseConfigured()} />;
}
