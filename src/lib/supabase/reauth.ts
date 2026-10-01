import "server-only";

import { type Session, type SupabaseClient, createClient } from "@supabase/supabase-js";

import { requireSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export type PasswordCheck =
  | { ok: true; client: SupabaseClient<Database>; session: Session }
  | { ok: false; reason: "wrong_password" | "rate_limited" | "unavailable" };

/**
 * Re-authenticates a signed-in user before a sensitive change (new password, account
 * deletion), so a session left open on someone else's device isn't enough to take over or
 * wipe the account.
 *
 * Uses a throwaway client that never touches the request's cookies. On success it returns
 * that client, holding a brand-new session for the same user.
 */
export async function verifyCurrentPassword(email: string, password: string): Promise<PasswordCheck> {
  const { url, key } = requireSupabasePublicEnv();
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    if (error?.status === 429 || error?.code === "over_request_rate_limit") {
      console.warn("[auth:reauth] rate limited", { code: error.code, status: error.status });
      return { ok: false, reason: "rate_limited" };
    }
    if (error?.code === "invalid_credentials" || error?.status === 400) return { ok: false, reason: "wrong_password" };
    console.error("[auth:reauth]", { code: error?.code, status: error?.status });
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, client, session: data.session };
}

/** Ends the throwaway session from verifyCurrentPassword when it isn't needed any more. */
export async function discardSession(client: SupabaseClient<Database>): Promise<void> {
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
}
