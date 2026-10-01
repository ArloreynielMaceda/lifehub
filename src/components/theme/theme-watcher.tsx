"use client";

import { useEffect } from "react";

import { applyTheme, readThemePreference, subscribeToTheme } from "./use-theme";

/**
 * Keeps <html> in step after the first paint: follows the device when the preference is
 * "system", picks up a choice made in another tab, and sets the browser UI colour.
 */
export function ThemeWatcher() {
  useEffect(() => {
    const sync = () => applyTheme(readThemePreference());
    sync();
    return subscribeToTheme(sync);
  }, []);
  return null;
}
