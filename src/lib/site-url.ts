import "server-only";

import { headers } from "next/headers";

import { getSiteUrl } from "@/lib/supabase/env";

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

function toHttpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Origin of the site the user is actually on (production domain, a preview deployment or
 * localhost), so auth email links always come back to the same place. Falls back to the
 * configured site URL when the request carries no usable origin.
 *
 * Safe to derive from the request: Server Actions already reject requests whose Origin
 * doesn't match the host, and Supabase only sends users to URLs on its Redirect URLs
 * allow-list.
 */
export async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();

  const origin = toHttpOrigin(requestHeaders.get("origin"));
  if (origin) return origin;

  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))?.split(",")[0]?.trim();
  if (host && HOST_PATTERN.test(host)) {
    const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
    const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : isLocal ? "http" : "https";
    const fromHost = toHttpOrigin(`${proto}://${host}`);
    if (fromHost) return fromHost;
  }

  return getSiteUrl();
}
