import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { lastAuthenticatedAt } from "@/lib/auth-recency";
import { todayInTimeZone, type ISODate } from "@/lib/dates";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string | null;
  /** When this session last proved who the user is (Unix seconds), see auth-recency. */
  authenticatedAt: number | null;
}

/**
 * The verified user for this request (JWT validated via getClaims), memoized per request.
 * Never trust getSession() on the server for authorization.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    authenticatedAt: lastAuthenticatedAt(claims),
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

const FALLBACK_PROFILE = (id: string): Profile => ({
  id,
  full_name: "",
  currency: DEFAULT_CURRENCY,
  timezone: "Asia/Manila",
  email_reminders: false,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
});

/** The signed-in user's profile. Creates it if the sign-up trigger has not run. */
export const getProfile = cache(async (): Promise<Profile> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data) return data;

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ id: user.id })
    .select("*")
    .single();
  if (error || !created) {
    console.error("[auth] could not load or create profile", { code: error?.code });
    return FALLBACK_PROFILE(user.id);
  }
  return created;
});

export interface UserContext {
  user: SessionUser;
  profile: Profile;
  /** Today's date in the user's time zone. */
  today: ISODate;
  timezone: string;
  currency: string;
}

export const getUserContext = cache(async (): Promise<UserContext> => {
  const user = await requireUser();
  const profile = await getProfile();
  return {
    user,
    profile,
    today: todayInTimeZone(profile.timezone),
    timezone: profile.timezone,
    currency: profile.currency,
  };
});

export function firstName(profile: Pick<Profile, "full_name">, email?: string | null): string {
  const name = profile.full_name.trim();
  if (name) return name.split(/\s+/)[0]!;
  if (email) return email.split("@")[0]!;
  return "there";
}

export function initials(profile: Pick<Profile, "full_name">, email?: string | null): string {
  const name = profile.full_name.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}
