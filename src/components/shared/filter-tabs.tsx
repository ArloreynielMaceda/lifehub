"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/** Pill-style tabs that set one search param; `defaultValue` removes the param. */
export function FilterTabs<T extends string>({
  param,
  options,
  value,
  defaultValue,
  label,
  counts,
}: {
  param: string;
  options: readonly { value: T; label: string }[];
  value: T;
  defaultValue: T;
  label: string;
  counts?: Partial<Record<T, number>>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (next: T) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (next === defaultValue) params.delete(param);
    else params.set(param, next);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-1 px-1">
        {options.map((option) => {
          const active = option.value === value;
          const count = counts?.[option.value];
          return (
            <li key={option.value}>
              <Link
                href={hrefFor(option.value)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option.label}
                {count ? (
                  <span className={cn("tabular rounded-full px-1.5 text-xs", active ? "bg-background/20" : "bg-muted")}>
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
