"use client";

import { useEffect } from "react";

import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[ui] fatal error", { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-background p-6 font-sans text-foreground">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">LifeHub ran into a problem</h1>
          <p className="text-sm text-muted-foreground">Your data is safe. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
