import "server-only";

import { redirect } from "next/navigation";

import type { ServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Detects a database that is behind the app code (migrations not applied yet), so users see
 * "run `npx supabase db push`" instead of a generic error.
 *
 * Update LATEST_MIGRATION and the probes whenever a migration adds something the app reads.
 */
export const LATEST_MIGRATION = "20261001000200_bill_payments";
export const UPDATE_REQUIRED_PATH = "/update-required";

/** Postgres / PostgREST codes meaning "that column / table / function does not exist". */
const SCHEMA_MISMATCH_CODES = new Set(["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export interface QueryError {
  code?: string;
}

export function isSchemaMismatch(error: QueryError | null | undefined): boolean {
  return Boolean(error?.code && SCHEMA_MISMATCH_CODES.has(error.code));
}

/**
 * For page data loaders: logs the error code and, if the database is missing something the
 * app needs, sends the user to the update instructions. Other errors are left to the caller.
 */
export function reportQueryError(scope: string, error: QueryError | null | undefined): void {
  if (!error) return;
  console.error(`[${scope}] failed`, { code: error.code ?? null });
  if (isSchemaMismatch(error)) redirect(UPDATE_REQUIRED_PATH);
}

/** Like reportQueryError, but throws for any other error (rendered by the error boundary). */
export function throwQueryError(scope: string, error: QueryError, message: string): never {
  reportQueryError(scope, error);
  throw new Error(message);
}

/**
 * true when every object introduced by the latest migrations exists. Works for signed-out
 * visitors too: PostgREST reports a missing column before checking permissions.
 */
export async function isDatabaseSchemaCurrent(supabase: ServerSupabaseClient): Promise<boolean> {
  const probes = await Promise.all([
    supabase.from("tasks").select("kind, repeat_days, starts_on, paused_on").limit(0),
    supabase.from("task_completions").select("id").limit(0),
    supabase.from("transactions").select("bill_occurrence_id").limit(0),
    supabase.from("bill_occurrences").select("outcome").limit(0),
  ]);
  return !probes.some((probe) => isSchemaMismatch(probe.error));
}
