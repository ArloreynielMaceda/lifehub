import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/tasks",
  "/bills",
  "/expenses",
  "/notes",
  "/documents",
  "/notifications",
  "/settings",
] as const;

/** Pages for signed-out visitors; signed-in users are sent to the dashboard instead. */
const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"] as const;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isProtectedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PROTECTED_PREFIXES);
}

/**
 * Refreshes the Supabase session cookie on every matched request and enforces route access.
 * Follows the official @supabase/ssr pattern: cookies are read from the request and written
 * to both the forwarded request and the response.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getSupabasePublicEnv();
  if (!env) {
    // Not configured yet: public pages still render and app pages show setup instructions.
    return response;
  }

  const supabase = createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it validates the JWT and
  // refreshes an expiring session.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const redirect = NextResponse.redirect(url);
    // Carry over refreshed auth cookies and no-cache headers.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    const cacheControl = response.headers.get("Cache-Control");
    if (cacheControl) redirect.headers.set("Cache-Control", cacheControl);
    return redirect;
  };

  if (!isSignedIn && isProtectedPath(pathname)) {
    return redirectTo("/login", { next: `${pathname}${search}` });
  }

  if (isSignedIn && matchesPrefix(pathname, GUEST_ONLY_PATHS)) {
    return redirectTo("/dashboard");
  }

  // Authenticated pages must never be cached by shared caches.
  if (isProtectedPath(pathname)) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}
