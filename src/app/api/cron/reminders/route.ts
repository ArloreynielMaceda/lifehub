import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { buildReminderDigest, getEmailProvider } from "@/lib/email";
import { createAdminClient, getAdminKey } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Scheduled job (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer
 * $CRON_SECRET`. It:
 *   1. generates due/overdue notifications for every user (idempotent in the database), and
 *   2. if an email provider is configured, emails a digest to users who opted in, marking each
 *      notification `emailed_at` so retries never send it twice.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured() || !getAdminKey()) {
    return NextResponse.json({ error: "Supabase secret key is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: generated, error: generateError } = await admin.rpc("generate_all_notifications");
  if (generateError) {
    console.error("[cron] notification generation failed", { code: generateError.code });
    return NextResponse.json({ error: "Notification generation failed" }, { status: 500 });
  }

  const email = getEmailProvider();
  if (!email) {
    return NextResponse.json({ generated, emailed: 0, email: "not configured" });
  }

  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("email_reminders", true)
    .limit(500);

  let emailed = 0;
  let failed = 0;
  for (const profile of profiles ?? []) {
    const { data: pending } = await admin
      .from("notifications")
      .select("id, title, body")
      .eq("user_id", profile.id)
      .is("emailed_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(20);
    if (!pending?.length) continue;

    const { data: userData } = await admin.auth.admin.getUserById(profile.id);
    const to = userData?.user?.email;
    if (!to) continue;

    const digest = buildReminderDigest(profile.full_name.split(" ")[0] ?? "", pending, getSiteUrl());
    const result = await email.send({ to, ...digest });
    if (!result.ok) {
      failed += 1;
      console.error("[cron] email send failed", { error: result.error });
      continue;
    }
    await admin
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .in(
        "id",
        pending.map((n) => n.id),
      );
    emailed += 1;
  }

  return NextResponse.json({ generated, emailed, failed });
}
