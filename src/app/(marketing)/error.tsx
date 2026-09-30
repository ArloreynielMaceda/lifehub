"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function MarketingError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/" />;
}
