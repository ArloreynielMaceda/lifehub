import "server-only";

import { GENERIC_ERROR } from "@/lib/action-result";
import { todayInTimeZone, type ISODate } from "@/lib/dates";
import { isSchemaMismatch } from "@/lib/schema-status";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";

export interface ActionContext {
  supabase: ServerSupabaseClient;
  userId: string;
  /** From the verified JWT; used to re-check the password before sensitive changes. */
  email: string | null;
}

/**
 * Authenticates a Server Action. Server Actions are reachable by direct POST, so every
 * action must call this and bail out when it returns null.
 */
export async function getActionContext(): Promise<ActionContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  const email = data?.claims?.email;
  return { supabase, userId, email: typeof email === "string" ? email : null };
}

/** The caller's current date in their own time zone (from their profile). */
export async function getUserToday(ctx: ActionContext): Promise<ISODate> {
  const { data } = await ctx.supabase.from("profiles").select("timezone").eq("id", ctx.userId).maybeSingle();
  return todayInTimeZone(data?.timezone ?? "Asia/Manila");
}

interface DbError {
  code?: string;
  message?: string;
  hint?: string | null;
  details?: string | null;
}

/**
 * Logs a database/storage error without user content or secrets, and returns a message that
 * is safe to show. Internal messages (SQL, constraint names) never reach the client.
 */
export function toUserError(scope: string, error: DbError | null | undefined, fallback = GENERIC_ERROR): string {
  const code = error?.code;
  console.error(`[${scope}]`, { code, hint: error?.hint ?? undefined });

  if (error?.hint === "document_quota") return "You've reached the document limit for your vault.";
  if (isSchemaMismatch(error)) {
    return "LifeHub's database needs an update before this works. Apply the latest migrations (npx supabase db push).";
  }
  switch (code) {
    case "23505":
      return "That item already exists.";
    case "23514":
    case "22023":
    case "22P02":
    case "22007":
    case "22008":
      return "Some values are invalid. Please review and try again.";
    case "23503":
      return "The related item no longer exists.";
    case "42501":
      return "You don't have permission to do that.";
    case "PGRST116":
    case "P0002":
      return "That item could not be found.";
    default:
      return fallback;
  }
}

/** Escapes LIKE/ILIKE wildcards so user search text is matched literally. */
export function toSearchPattern(term: string): string {
  const escaped = term.trim().slice(0, 100).replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
