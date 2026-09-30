import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Logo } from "@/components/shared/logo";
import { SchemaUpdateRequired } from "@/components/shared/schema-update-required";
import { Button } from "@/components/ui/button";
import { LATEST_MIGRATION, isDatabaseSchemaCurrent } from "@/lib/schema-status";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Database update" };

/** Where data loaders send users when the database is behind the app code. */
export default async function UpdateRequiredPage() {
  await connection();
  const current = isSupabaseConfigured() ? await isDatabaseSchemaCurrent(await createClient()) : false;

  if (!current) return <SchemaUpdateRequired migration={LATEST_MIGRATION} />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <Logo />
      <div className="space-y-4 rounded-2xl border bg-card p-6 sm:p-8">
        <div className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success">
          <CircleCheck className="size-5" aria-hidden="true" />
        </div>
        <h1 className="font-display text-3xl">Your database is up to date</h1>
        <p className="text-sm text-muted-foreground">Everything LifeHub needs is in place.</p>
        <Button asChild>
          <Link href="/dashboard">Go to your dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
