import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Privileged client that bypasses Row Level Security. Used ONLY by the scheduled reminder
 * job (`/api/cron/reminders`). Never import this from code that handles user requests.
 *
 * Accepts the new secret key (`SUPABASE_SECRET_KEY`, sb_secret_…) or the legacy
 * `SUPABASE_SERVICE_ROLE_KEY`.
 */
export function getAdminKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function createAdminClient() {
  const key = getAdminKey();
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }
  const { url } = requireSupabasePublicEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
