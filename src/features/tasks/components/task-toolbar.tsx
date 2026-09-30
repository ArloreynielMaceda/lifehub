"use client";

import { CalendarDays, List } from "lucide-react";
import Link from "next/link";

import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useQueryParams } from "@/hooks/use-query-params";
import { cn } from "@/lib/utils";

import {
  PRIORITY_LABELS,
  SCOPE_LABELS,
  SORT_LABELS,
  TASK_PRIORITIES,
  TASK_SCOPES,
  TASK_SORTS,
  type TaskScope,
} from "../constants";
import type { TaskFilters } from "../schemas";

export function TaskToolbar({
  filters,
  categories,
  counts,
}: {
  filters: TaskFilters;
  categories: string[];
  counts: Partial<Record<TaskScope, number>>;
}) {
  const { update, pending, searchParams } = useQueryParams();

  const scopeHref = (scope: TaskScope) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (scope === "open") params.delete("scope");
    else params.set("scope", scope);
    const query = params.toString();
    return query ? `/tasks?${query}` : "/tasks";
  };

  const layoutToggle = (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={filters.view}
      onValueChange={(view) => view && update({ view: view === "list" ? "" : view, month: "" })}
      aria-label="Layout"
      className="shrink-0"
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <List aria-hidden="true" /> List
      </ToggleGroupItem>
      <ToggleGroupItem value="calendar" aria-label="Calendar view">
        <CalendarDays aria-hidden="true" /> Calendar
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Task views" className="-mx-1 min-w-0 overflow-x-auto pb-1">
        <ul className="flex min-w-max gap-1 px-1">
          {TASK_SCOPES.map((scope) => {
            const active = filters.scope === scope;
            const count = counts[scope];
            return (
              <li key={scope}>
                <Link
                  href={scopeHref(scope)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {SCOPE_LABELS[scope]}
                  {count ? (
                    <span
                      className={cn(
                        "tabular rounded-full px-1.5 text-xs",
                        active ? "bg-background/20" : scope === "overdue" ? "bg-destructive-soft text-destructive" : "bg-muted",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {layoutToggle}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput
          value={filters.q}
          onSearch={(q) => update({ q })}
          placeholder={filters.scope === "routines" ? "Search routines" : "Search tasks"}
          label={filters.scope === "routines" ? "Search routines" : "Search tasks"}
          className="lg:w-60 lg:shrink-0"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <NativeSelect
            aria-label="Filter by priority"
            value={filters.priority ?? ""}
            onChange={(event) => update({ priority: event.target.value })}
            className="w-full sm:w-36"
          >
            <NativeSelectOption value="">All priorities</NativeSelectOption>
            {TASK_PRIORITIES.map((priority) => (
              <NativeSelectOption key={priority} value={priority}>
                {PRIORITY_LABELS[priority]} priority
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {filters.scope !== "completed" && filters.scope !== "routines" ? (
            <NativeSelect
              aria-label="Filter by status"
              value={filters.status ?? ""}
              onChange={(event) => update({ status: event.target.value })}
              className="w-full sm:w-36"
            >
              <NativeSelectOption value="">Any status</NativeSelectOption>
              <NativeSelectOption value="pending">Pending</NativeSelectOption>
              <NativeSelectOption value="in_progress">In progress</NativeSelectOption>
            </NativeSelect>
          ) : null}
          {categories.length > 0 ? (
            <NativeSelect
              aria-label="Filter by category"
              value={filters.category ?? ""}
              onChange={(event) => update({ category: event.target.value })}
              className="w-full sm:w-40"
            >
              <NativeSelectOption value="">All categories</NativeSelectOption>
              {categories.map((category) => (
                <NativeSelectOption key={category} value={category}>
                  {category}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
          {filters.view === "list" && filters.scope !== "routines" ? (
            <NativeSelect
              aria-label="Sort tasks"
              value={filters.sort}
              onChange={(event) => update({ sort: event.target.value === "due_date" ? "" : event.target.value })}
              className="w-full sm:w-40"
            >
              {TASK_SORTS.map((sort) => (
                <NativeSelectOption key={sort} value={sort}>
                  Sort: {SORT_LABELS[sort]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
        </div>
        {pending ? <Spinner className="text-muted-foreground" aria-label="Updating" /> : null}
      </div>
    </div>
  );
}
