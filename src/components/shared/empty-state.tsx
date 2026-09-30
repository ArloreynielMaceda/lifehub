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
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
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
        {icon ? (
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
