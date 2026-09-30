"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Friendly error fallback. Never shows the error message or stack to the user. */
export function ErrorView({
  error,
  retry,
  homeHref = "/dashboard",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    // Only the digest is useful for correlating with server logs.
    console.error("[ui] unexpected error", { digest: error.digest });
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive-soft text-destructive">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load this page. Your data is safe — please try again in a moment.
        {error.digest ? <span className="mt-2 block text-xs">Reference: {error.digest}</span> : null}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw aria-hidden="true" /> Try again
        </Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>Go home</Link>
        </Button>
      </div>
    </div>
  );
}
