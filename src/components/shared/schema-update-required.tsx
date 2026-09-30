import { DatabaseZap } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/shared/logo";

/**
 * Shown instead of private pages when the database is missing the latest migrations
 * (the app code is newer than the schema). Nothing is lost: applying the migrations fixes it.
 */
export function SchemaUpdateRequired({ migration }: { migration: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <Logo />
      <div className="min-w-0 space-y-4 rounded-2xl border bg-card p-6 sm:p-8">
        <div className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <DatabaseZap className="size-5" aria-hidden="true" />
        </div>
        <h1 className="font-display text-3xl">Your database needs an update</h1>
        <p className="text-sm text-muted-foreground">
          This version of LifeHub uses new database features (routines and bill payments) that
          haven&apos;t been added to your Supabase project yet. Your existing data is safe — the update
          only adds new columns and tables.
        </p>
        <p className="text-sm text-muted-foreground">From the project folder, run:</p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">
{`npx supabase db push --dry-run   # preview
npx supabase db push             # apply`}
        </pre>
        <p className="text-sm text-muted-foreground">
          Then reload this page. Latest migration:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{migration}</code>. Prefer the dashboard? Run the
          new files from <code className="text-xs">supabase/migrations</code> in the SQL Editor, in order.
        </p>
        <Link href="/" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← Back to the homepage
        </Link>
      </div>
    </main>
  );
}
