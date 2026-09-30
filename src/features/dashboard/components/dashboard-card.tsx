import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function DashboardCard({
  title,
  icon,
  href,
  linkLabel = "View all",
  children,
  className,
  headingId,
}: {
  title: string;
  icon: React.ReactNode;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId} className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-tight">
          <span className="text-muted-foreground [&_svg]:size-4" aria-hidden="true">
            {icon}
          </span>
          {title}
        </h2>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {linkLabel}
            <ArrowRight className="size-3.5" aria-hidden="true" />
            <span className="sr-only"> — {title}</span>
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function CardEmpty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}
