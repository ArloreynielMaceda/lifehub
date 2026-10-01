/**
 * Public Supabase configuration. These values are safe to expose to the browser: the
 * publishable key only grants what Row Level Security allows.
 *
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_…) is preferred; the legacy
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback for older projects.
 * Each variable is referenced statically so Next.js can inline it into client bundles.
 */
export function getSupabasePublicEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}

export function requireSupabasePublicEnv(): { url: string; key: string } {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return env;
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Configured absolute site URL, for places without a request (metadata, scheduled emails).
 * Request handlers should prefer the request's own origin (see `getRequestOrigin`).
 *
 * Order: NEXT_PUBLIC_SITE_URL → Vercel production URL → Vercel deployment URL → localhost.
 * A localhost NEXT_PUBLIC_SITE_URL (e.g. copied from .env.local) is ignored on Vercel, so a
 * deployed site never sends people to localhost.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  const onVercel = Boolean(process.env.VERCEL);
  if (explicit && !(onVercel && LOCAL_ORIGIN.test(explicit))) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return explicit || "http://localhost:3000";
}
