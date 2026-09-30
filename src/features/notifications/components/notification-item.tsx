"use client";

import { AlarmClock, CalendarClock, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import type { NotificationItem } from "../queries";

const KIND_STYLES = {
  overdue: { icon: CircleAlert, label: "Overdue", className: "bg-destructive-soft text-destructive" },
  due_today: { icon: AlarmClock, label: "Due today", className: "bg-warning-soft text-warning" },
  due_soon: { icon: CalendarClock, label: "Coming up", className: "bg-info-soft text-info" },
} as const;

export function NotificationRow({
  item,
  onOpen,
  compact = false,
}: {
  item: NotificationItem;
  onOpen?: (item: NotificationItem) => void;
  compact?: boolean;
}) {
  const style = KIND_STYLES[item.kind];
  const Icon = style.icon;
  const unread = !item.read_at;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        compact ? "py-2.5" : "py-3",
      )}
    >
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", style.className)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", unread ? "font-semibold" : "text-foreground/80")}>
          {item.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {style.label} · {item.body} · {item.timeLabel}
        </span>
      </span>
      {unread ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
      ) : null}
    </button>
  );
}
