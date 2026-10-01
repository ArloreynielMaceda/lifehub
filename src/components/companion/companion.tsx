import { Bell, ChartColumn, Check, Files, Lightbulb, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import Image, { type StaticImageData } from "next/image";

import calm from "@/assets/companion/calm.webp";
import happy from "@/assets/companion/happy.webp";
import poseCelebrate from "@/assets/companion/pose-celebrate.webp";
import poseDocuments from "@/assets/companion/pose-documents.webp";
import poseFinance from "@/assets/companion/pose-finance.webp";
import poseGoodAfternoon from "@/assets/companion/pose-goodafternoon.webp";
import poseGoodEvening from "@/assets/companion/pose-goodevening.webp";
import poseGoodMorning from "@/assets/companion/pose-goodmorning.webp";
import poseNight from "@/assets/companion/pose-night.webp";
import posePlanning from "@/assets/companion/pose-planning.webp";
import poseReminder from "@/assets/companion/pose-reminder.webp";
import poseWelcome from "@/assets/companion/pose-welcome.webp";
import portrait from "@/assets/companion/portrait.webp";
import sleepy from "@/assets/companion/sleepy.webp";
import surprised from "@/assets/companion/surprised.webp";
import thinking from "@/assets/companion/thinking.webp";
import wink from "@/assets/companion/wink.webp";
import { cn } from "@/lib/utils";

/**
 * The LifeHub companion, at two levels. Both are always decorative — the text beside them
 * carries the meaning — so they are hidden from assistive technology.
 *
 * 1. `Companion` / `CompanionNote`: a small face for micro feedback (toasts, status lines,
 *    small empty states, short data-driven sentences).
 * 2. `CompanionFigure` / `CompanionBanner`: a half-body pose for a few deliberate larger
 *    moments (dashboard welcome, finance insight, urgent bills, first-use Notes/Documents,
 *    landing page). It never takes more than about a quarter of its area, and on phones it is
 *    replaced by the small face so it never pushes data below the fold.
 *
 * Use sparingly: one companion per view at most, never as the main element.
 *
 * Motion: faces tilt and half-body poses sway very slightly (a few pixels, several seconds per
 * cycle). Everything stops for people who prefer reduced motion (see globals.css).
 */

export type CompanionMood = "welcome" | "happy" | "calm" | "wink" | "thinking" | "surprised" | "sleepy";
export type CompanionBadge = "check" | "bell" | "chart" | "files" | "idea" | "moon" | "sunrise" | "sun" | "sunset";
export type CompanionSize = "xs" | "sm" | "md" | "lg";

const FACES: Record<CompanionMood, StaticImageData> = {
  welcome: portrait,
  happy,
  calm,
  wink,
  thinking,
  surprised,
  sleepy,
};

/** Each face starts its idle tilt at a different point, so two faces never move in lockstep. */
const FACE_PHASE: Record<CompanionMood, string> = {
  welcome: "0s",
  happy: "-0.8s",
  calm: "-1.6s",
  wink: "-2.4s",
  thinking: "-3.2s",
  surprised: "-4s",
  sleepy: "-4.8s",
};

export type CompanionPose =
  | "welcome"
  | "planning"
  | "finance"
  | "reminder"
  | "documents"
  | "celebrate"
  | "goodmorning"
  | "goodafternoon"
  | "goodevening"
  | "night";

const POSES: Record<CompanionPose, StaticImageData> = {
  welcome: poseWelcome,
  planning: posePlanning,
  finance: poseFinance,
  reminder: poseReminder,
  documents: poseDocuments,
  celebrate: poseCelebrate,
  goodmorning: poseGoodMorning,
  goodafternoon: poseGoodAfternoon,
  goodevening: poseGoodEvening,
  night: poseNight,
};

const BADGES = {
  check: Check,
  bell: Bell,
  chart: ChartColumn,
  files: Files,
  idea: Lightbulb,
  moon: Moon,
  sunrise: Sunrise,
  sun: Sun,
  sunset: Sunset,
};

const PIXELS: Record<CompanionSize, number> = { xs: 28, sm: 40, md: 52, lg: 72 };

/** Four-point sparkle, drawn in currentColor. */
function Sparkle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("absolute animate-companion-twinkle", className)} style={style}>
      <path
        d="M12 1.5c.5 5.6 4.4 9.5 10 10-5.6.5-9.5 4.4-10 10-.5-5.6-4.4-9.5-10-10 5.6-.5 9.5-4.4 10-10Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Companion({
  mood,
  badge,
  sparkles = false,
  size = "sm",
  className,
}: {
  mood: CompanionMood;
  badge?: CompanionBadge;
  /** Subtle celebration: two small sparkles that twinkle a few times. */
  sparkles?: boolean;
  size?: CompanionSize;
  className?: string;
}) {
  const px = PIXELS[size];
  const BadgeIcon = badge ? BADGES[badge] : null;
  const badgePx = Math.max(16, Math.round(px * 0.4));

  return (
    <span
      aria-hidden="true"
      data-companion={mood}
      className={cn("relative inline-flex shrink-0 animate-companion-in", className)}
      style={{ width: px, height: px }}
    >
      <span className="absolute inset-0 overflow-hidden rounded-full bg-companion ring-1 ring-primary/10">
        <Image
          src={FACES[mood]}
          alt=""
          width={px}
          height={px}
          className="size-full animate-companion-bob object-cover"
          style={{ animationDelay: FACE_PHASE[mood] }}
        />
      </span>
      {BadgeIcon ? (
        <span
          className="absolute -top-0.5 -right-1 flex animate-companion-pop items-center justify-center rounded-full bg-card text-primary shadow-sm ring-1 ring-border"
          style={{ width: badgePx, height: badgePx }}
        >
          <BadgeIcon style={{ width: badgePx * 0.56, height: badgePx * 0.56 }} strokeWidth={2.4} />
        </span>
      ) : null}
      {sparkles ? (
        <>
          <Sparkle className="text-warning" style={{ width: px * 0.26, height: px * 0.26, top: -px * 0.08, left: -px * 0.1 }} />
          <Sparkle
            className="text-primary/70 [animation-delay:400ms]"
            style={{ width: px * 0.18, height: px * 0.18, bottom: px * 0.12, right: -px * 0.16 }}
          />
        </>
      ) : null}
    </span>
  );
}

/**
 * The companion "saying" one short, useful line: a greeting summary, an insight or a nudge.
 * The text is real content; the face is decoration.
 */
export function CompanionNote({
  mood,
  badge,
  sparkles,
  title,
  children,
  tone = "default",
  size = "sm",
  className,
}: {
  mood: CompanionMood;
  badge?: CompanionBadge;
  sparkles?: boolean;
  title?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "warning";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Companion mood={mood} badge={badge} sparkles={sparkles} size={size} className="mt-0.5" />
      <div
        className={cn(
          "min-w-0 rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-sm",
          tone === "warning" ? "border-warning/25 bg-warning-soft/70" : "bg-card",
        )}
      >
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        <div className={cn(title ? "mt-0.5 text-muted-foreground" : "text-foreground/80")}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Half-body pose (cut at the hips). Place it so its flat bottom edge sits on the edge of a
 * container with `overflow-hidden`, and size it with a height class, e.g. `h-48`. It sways
 * gently from the hips; the bottom few pixels are tucked under the edge so the sway never
 * shows a gap.
 */
export function CompanionFigure({
  pose,
  eager = false,
  className,
}: {
  pose: CompanionPose;
  /** Load immediately (visible as the page opens, e.g. the dashboard welcome area). */
  eager?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("relative -mb-1 inline-flex shrink-0 animate-companion-sway", className)}>
      <Image
        src={POSES[pose]}
        alt=""
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        className="pointer-events-none block h-full w-auto animate-companion-in select-none"
      />
    </span>
  );
}

/**
 * A short insight or reminder with a half-body pose beside it (tablet and up). On phones it
 * becomes the compact small-face note, so the content below stays in view.
 */
export function CompanionBanner({
  pose,
  mood,
  badge,
  title,
  children,
  tone = "default",
  className,
}: {
  pose: CompanionPose;
  /** Small face used on phones. */
  mood: CompanionMood;
  badge?: CompanionBadge;
  title?: string;
  children: React.ReactNode;
  tone?: "default" | "warning";
  className?: string;
}) {
  return (
    <div className={className}>
      <CompanionNote mood={mood} badge={badge} tone={tone} className="md:hidden">
        {children}
      </CompanionNote>
      <div
        className={cn(
          "hidden min-h-[9.5rem] grid-cols-[minmax(0,1fr)_11rem] overflow-hidden rounded-2xl border md:grid",
          tone === "warning" ? "border-warning/25 bg-warning-soft/50" : "bg-card",
        )}
      >
        <div className="self-center px-5 py-4">
          {title ? <p className="eyebrow mb-1.5">{title}</p> : null}
          <p className="max-w-prose text-[0.95rem] text-foreground/85">{children}</p>
        </div>
        <div aria-hidden="true" className="relative flex items-end justify-center">
          <span className="absolute inset-0 bg-companion-glow" />
          <CompanionFigure pose={pose} className="relative h-[8.5rem]" />
        </div>
      </div>
    </div>
  );
}
