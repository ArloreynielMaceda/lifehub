import type { CompanionBadge, CompanionMood, CompanionPose } from "@/components/companion/companion";

/** Today's progress, as the dashboard already loads it. */
export interface DayProgress {
  /** 0–23 in the user's time zone. */
  hour: number;
  /** Open tasks due today. */
  tasksDueToday: number;
  /** Open tasks past their due date. */
  overdue: number;
  /** Tasks due today that are already completed. */
  tasksDoneToday: number;
  /** Active routines scheduled today, and how many of them are still to do. */
  routinesScheduled: number;
  routinesLeft: number;
  /** Bills due in the dashboard's look-ahead window. */
  billsComingUp: number;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

/** Morning 5–11, afternoon 12–17, evening 18–21, night 22–4 (the user's own time zone). */
export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export type DashboardMoment = TimeOfDay | "focus" | "all-done";

/** Something was planned for today and none of it is left. */
export function isAllDone(p: DayProgress): boolean {
  const pending = p.tasksDueToday + p.overdue + p.routinesLeft;
  const finished = p.tasksDoneToday + (p.routinesScheduled - p.routinesLeft);
  return pending === 0 && finished > 0;
}

/** Night always winds down; during the day, progress (all done, overdue) beats the clock. */
export function dashboardMoment(p: DayProgress): DashboardMoment {
  const time = timeOfDay(p.hour);
  if (time === "night") return "night";
  if (isAllDone(p)) return "all-done";
  if (p.overdue > 0) return "focus";
  return time;
}

/** The small face for each moment (phones, and anywhere space is tight). */
export const MOMENT_COMPANION: Record<
  DashboardMoment,
  { mood: CompanionMood; badge?: CompanionBadge; sparkles?: boolean }
> = {
  morning: { mood: "happy", badge: "sunrise" },
  afternoon: { mood: "welcome", badge: "sun" },
  evening: { mood: "calm", badge: "sunset" },
  night: { mood: "sleepy", badge: "moon" },
  focus: { mood: "calm", badge: "bell" },
  "all-done": { mood: "wink", badge: "check", sparkles: true },
};

/** The half-body pose for the dashboard welcome area (tablet and up). */
export const MOMENT_POSE: Record<DashboardMoment, CompanionPose> = {
  morning: "goodmorning",
  afternoon: "goodafternoon",
  evening: "goodevening",
  night: "night",
  focus: "reminder",
  "all-done": "celebrate",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The one line the companion says under the greeting. */
export function dashboardSummary(p: DayProgress): string {
  const time = timeOfDay(p.hour);
  const bills = p.billsComingUp ? `${plural(p.billsComingUp, "bill")} coming up.` : "";

  if (isAllDone(p)) {
    const signOff = time === "night" ? "Rest well." : time === "evening" ? "Enjoy your evening." : "Nice work.";
    return ["Everything for today is done.", bills || signOff].join(" ");
  }

  const parts: string[] = [];
  if (p.tasksDueToday) parts.push(`${plural(p.tasksDueToday, "task")} due today`);
  if (p.overdue) parts.push(`${p.overdue} overdue`);
  if (p.routinesLeft) parts.push(`${plural(p.routinesLeft, "routine")} to do`);
  if (p.billsComingUp) parts.push(`${plural(p.billsComingUp, "bill")} coming up`);
  if (parts.length === 0) {
    if (time === "night") return "Nothing left for today. Time to rest.";
    if (time === "evening") return "Nothing left for today. Enjoy your evening.";
    return "Nothing urgent today. A good moment to plan ahead.";
  }
  return `You have ${parts.join(", ")}.`;
}
