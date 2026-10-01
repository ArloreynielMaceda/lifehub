import {
  Companion,
  CompanionFigure,
  type CompanionBadge,
  type CompanionMood,
  type CompanionPose,
} from "@/components/companion/companion";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  companion,
  illustration,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  /** First-time and "all done" states: a small companion instead of the icon. */
  companion?: { mood: CompanionMood; badge?: CompanionBadge; sparkles?: boolean };
  /** Important first-use states (Notes, Documents): a half-body pose in a soft frame. */
  illustration?: CompanionPose;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Empty
      className={cn(
        "border border-dashed border-border bg-card/60",
        compact ? "gap-3 p-5" : "p-8 sm:p-10",
        className,
      )}
    >
      <EmptyHeader>
        {illustration ? (
          <span
            aria-hidden="true"
            className="mb-3 flex h-32 w-36 items-end justify-center overflow-hidden rounded-[1.75rem] bg-companion sm:h-40 sm:w-44"
          >
            <CompanionFigure pose={illustration} className="h-[7.5rem] sm:h-[9.5rem]" />
          </span>
        ) : companion ? (
          <Companion {...companion} size={compact ? "md" : "lg"} className="mb-2" />
        ) : icon ? (
          <EmptyMedia variant="icon" className="size-10 rounded-xl bg-accent text-accent-foreground [&_svg:not([class*='size-'])]:size-5">
            {icon}
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
