import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  ConfirmationLinkExpired,
  ConfirmedInOtherBrowser,
  EmailConfirmed,
} from "@/features/auth/components/email-confirmation";
import { firstName, getProfile, getSessionUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Email confirmation" };

/**
 * Where sign-up confirmation links land (via /auth/confirm). The signed-in state comes from
 * the real session; `status` only distinguishes the two signed-out outcomes.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  if (!isSupabaseConfigured()) redirect("/login");
  const { status } = await searchParams;

  const user = await getSessionUser();
  if (user) {
    const profile = await getProfile();
    return <EmailConfirmed name={firstName(profile, user.email)} email={user.email} />;
  }
  if (status === "confirmed") return <ConfirmedInOtherBrowser />;
  if (status === "expired") return <ConfirmationLinkExpired />;
  redirect("/login");
}
