import "server-only";

import { relativeTimeLabel } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { reportQueryError } from "@/lib/schema-status";
import type { AppNotification } from "@/types/database";

export type NotificationItem = Pick<
  AppNotification,
  "id" | "kind" | "title" | "body" | "link" | "read_at" | "created_at" | "source_type"
> & { timeLabel: string };

const COLUMNS = "id, kind, title, body, link, read_at, created_at, source_type";

/**
 * Generates any due/overdue notifications for the current user. Idempotent (database
 * dedupe key), so it is safe to call on every full page load.
 */
export async function syncNotifications(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sync_my_notifications");
  reportQueryError("notifications:sync", error);
}

function withLabels(rows: Omit<NotificationItem, "timeLabel">[], timeZone: string): NotificationItem[] {
  const now = new Date();
  return rows.map((row) => ({ ...row, timeLabel: relativeTimeLabel(row.created_at, timeZone, now) }));
}

export async function getNotificationSummary(timeZone: string, limit = 8) {
  const supabase = await createClient();
  const [recent, unread] = await Promise.all([
    supabase.from("notifications").select(COLUMNS).order("created_at", { ascending: false }).limit(limit),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  reportQueryError("notifications:load", recent.error);
  return {
    items: withLabels(recent.data ?? [], timeZone),
    unreadCount: unread.count ?? 0,
  };
}

export async function listNotifications(timeZone: string, page: number, pageSize: number, filter: "all" | "unread") {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select(COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filter === "unread") query = query.is("read_at", null);
  const { data, count, error } = await query;
  reportQueryError("notifications:list", error);
  return { items: withLabels(data ?? [], timeZone), total: count ?? 0 };
}
