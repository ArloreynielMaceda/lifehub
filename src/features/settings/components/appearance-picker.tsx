"use client";

import { THEME_OPTIONS } from "@/components/theme/theme-toggle";
import { useTheme } from "@/components/theme/use-theme";
import { FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isThemePreference, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

/** Fixed colours (not theme tokens), so each card previews its own theme whatever is showing now. */
const PREVIEW_COLORS: Record<ResolvedTheme, { canvas: string; card: string; line: string; text: string; accent: string }> = {
  light: { canvas: "#f3f3f7", card: "#ffffff", line: "#e2e2ea", text: "#d3d4de", accent: "#5753d2" },
  dark: { canvas: "#0d0e14", card: "#1a1a23", line: "#2f2f39", text: "#3e3f4a", accent: "#9699fa" },
};

function PreviewPane({ theme }: { theme: ResolvedTheme }) {
  const c = PREVIEW_COLORS[theme];
  return (
    <span className="absolute inset-0 flex gap-1.5 p-2" style={{ background: c.canvas }}>
      <span className="flex w-1/4 flex-col gap-1 pt-1">
        <span className="h-1.5 rounded-full" style={{ background: c.accent }} />
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: c.text }} />
        <span className="h-1.5 w-4/5 rounded-full" style={{ background: c.text }} />
      </span>
      <span className="flex flex-1 flex-col gap-1 rounded-md border p-1.5" style={{ background: c.card, borderColor: c.line }}>
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: c.text }} />
        <span className="h-1.5 w-4/5 rounded-full" style={{ background: c.text }} />
        <span className="mt-auto h-2.5 w-2/5 rounded-sm" style={{ background: c.accent }} />
      </span>
    </span>
  );
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  return (
    <span aria-hidden="true" className="relative block h-16 overflow-hidden rounded-md ring-1 ring-border">
      {theme === "system" ? (
        <>
          <PreviewPane theme="light" />
          <span className="absolute inset-0 [clip-path:polygon(58%_0,100%_0,100%_100%,42%_100%)]">
            <PreviewPane theme="dark" />
          </span>
        </>
      ) : (
        <PreviewPane theme={theme} />
      )}
    </span>
  );
}

/** Light, dark or the device's setting. Applies straight away and is remembered on this device. */
export function AppearancePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="space-y-3 sm:max-w-md">
      <RadioGroup
        aria-label="Theme"
        value={preference}
        onValueChange={(value) => {
          if (isThemePreference(value)) setPreference(value);
        }}
        className="grid-cols-3 gap-2.5 sm:gap-3"
      >
        {THEME_OPTIONS.map(({ value, label }) => (
          <FieldLabel key={value} htmlFor={`theme-${value}`} className="font-normal">
            <div data-slot="field" className="flex w-full flex-col gap-2.5">
              <ThemePreview theme={value} />
              <span className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`theme-${value}`} />
                <span className="text-sm font-medium">{label}</span>
              </span>
            </div>
          </FieldLabel>
        ))}
      </RadioGroup>
      <p className="text-sm text-muted-foreground">
        Saved on this device. System follows your phone or computer&apos;s setting.
      </p>
    </div>
  );
}
