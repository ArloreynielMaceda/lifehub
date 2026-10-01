import Link from "next/link";

import { Companion } from "@/components/companion/companion";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <Companion mood="surprised" size="lg" className="mt-4" />
      <div className="space-y-2">
        <p className="eyebrow">Error 404</p>
        <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="text-sm text-muted-foreground">
          It may have been moved or deleted, or it belongs to a different account.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Homepage</Link>
        </Button>
      </div>
    </main>
  );
}
