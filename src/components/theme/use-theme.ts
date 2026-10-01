"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  DARK_MEDIA_QUERY,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

const CHANGE_EVENT = "lifehub:theme-change";

/** Used when storage is unavailable (some private windows), so the choice still applies for this visit. */
let memoryPreference: ThemePreference = "system";

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return memoryPreference;
  }
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

/**
 * Puts the theme on <html> — the same thing the inline head script does on first load — and
 * updates the browser UI colour. Transitions are paused for the switch so every surface
 * changes at once instead of fading one by one.
 */
export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  const pause = document.createElement("style");
  pause.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(pause);

  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", THEME_COLORS[resolved]));

  // Force a style flush before transitions come back.
  void window.getComputedStyle(root).color;
  window.setTimeout(() => pause.remove(), 1);
}

/** Notifies on: a choice made in this tab, a choice made in another tab, the device theme changing. */
export function subscribeToTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) onChange();
  };
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * The saved preference and the theme actually showing. The server can't know either, so
 * server renders (and hydration) use "system"/"light"; anything that must look right before
 * hydration should use the `dark:` variant in CSS instead.
 */
export function useTheme() {
  const preference = useSyncExternalStore(subscribeToTheme, readThemePreference, () => "system" as const);
  const resolved = useSyncExternalStore(
    subscribeToTheme,
    () => resolveTheme(readThemePreference()),
    () => "light" as const,
  );

  const setPreference = useCallback((next: ThemePreference) => {
    memoryPreference = next;
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the in-memory value keeps the choice for this visit.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { preference, resolved, setPreference };
}
