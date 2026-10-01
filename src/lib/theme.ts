/**
 * Light / dark theme. The choice is a per-device preference kept in localStorage (no account
 * data involved), so it also works on the signed-out pages. "system" follows the device.
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "lifehub-theme";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** Browser UI colour (mobile address bar, installed app title bar): the page background. */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#fbfbfc", dark: "#13131a" };

/**
 * Inlined in <head> so the saved theme is on <html> before the first paint (no light flash
 * for dark-mode users). Keep it tiny and dependency-free; it must never throw.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("${DARK_MEDIA_QUERY}").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
