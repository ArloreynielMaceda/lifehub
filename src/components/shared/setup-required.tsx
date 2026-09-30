import { Database } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/shared/logo";

/** Shown instead of private pages until Supabase environment variables are configured. */
export function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <Logo />
      <div className="min-w-0 space-y-4 rounded-2xl border bg-card p-6 sm:p-8">
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Database className="size-5" aria-hidden="true" />
        </div>
        <h1 className="font-display text-3xl">Connect Supabase to continue</h1>
        <p className="text-sm text-muted-foreground">
          LifeHub stores your data in your own Supabase project. Add these variables to
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">.env.local</code>
          and restart the dev server:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">
{`NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000`}
        </pre>
        <p className="text-sm text-muted-foreground">
          Then apply the SQL migrations in <code className="text-xs">supabase/migrations</code>. The
          README walks through every step.
        </p>
        <Link href="/" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← Back to the homepage
        </Link>
      </div>
    </main>
  );
}
