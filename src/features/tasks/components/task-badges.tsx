import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority, type TaskStatus } from "../constants";

const PRIORITY_VARIANT = {
  high: "danger",
  medium: "warning",
  low: "muted",
} as const;

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className={cn("font-medium", className)}>
      <span className="sr-only">Priority: </span>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  if (status === "pending") return null;
  return (
    <Badge variant={status === "completed" ? "success" : "info"} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
