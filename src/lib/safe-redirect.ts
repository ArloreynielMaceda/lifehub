const DEFAULT_REDIRECT = "/dashboard";

/**
 * Returns a same-origin relative path for post-auth redirects, or the fallback.
 * Rejects absolute URLs, protocol-relative URLs (`//evil.com`), backslash tricks
 * (`/\evil.com`) and control characters, which prevents open redirects.
 */
export function safeNextPath(next: string | null | undefined, fallback = DEFAULT_REDIRECT): string {
  if (!next || typeof next !== "string") return fallback;
  if (next.length > 512) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(next)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;

  try {
    const base = "http://lifehub.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
