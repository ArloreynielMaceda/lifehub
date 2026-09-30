"use client";

import { CheckCircle2, RotateCcw, SkipForward } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatISODate, formatTimestamp } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { undoBillOccurrence } from "../actions";
import type { BillHistoryItem } from "../queries";

function HistoryRow({ item, timeZone }: { item: BillHistoryItem; timeZone: string }) {
  const [pending, startTransition] = useTransition();
  const skipped = item.outcome === "skipped";
  const Icon = skipped ? SkipForward : CheckCircle2;
  const status = skipped ? "Skipped" : item.kind === "bill" ? "Paid" : "Done";
  const when = item.expense_date
    ? formatISODate(item.expense_date, "medium")
    : formatTimestamp(item.completed_at, timeZone, "date");

  const undo = () =>
    startTransition(async () => {
      const result = await undoBillOccurrence(item.id);
      if (result.ok) toast.success(result.message ?? "Undone");
      else toast.error(result.error);
    });

  return (
    <li className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          skipped ? "bg-muted text-muted-foreground" : "bg-success-soft text-success",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <Badge variant={skipped ? "muted" : "success"}>{status}</Badge>
          <span>
            {skipped ? "" : `${when} · `}for {formatISODate(item.due_date, "medium")}
            {item.category ? ` · ${item.category}` : ""}
          </span>
          {!skipped && item.kind === "bill" && item.amount_minor !== null ? (
            <span>· {item.expense_date ? "in Expenses" : "not added to Expenses"}</span>
          ) : null}
        </p>
      </div>
      {!skipped && item.amount_minor !== null ? (
        <Money minor={item.amount_minor} currency={item.currency} className="text-sm font-semibold" />
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={undo}
        disabled={pending}
        aria-label={`Undo: mark ${item.title} for ${formatISODate(item.due_date, "short")} as unpaid`}
        title="Undo (most recent only)"
        className="text-muted-foreground"
      >
        {pending ? <Spinner aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
      </Button>
    </li>
  );
}

export function BillHistory({ items, timeZone }: { items: BillHistoryItem[]; timeZone: string }) {
  return (
    <ul role="list" className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => (
        <HistoryRow key={item.id} item={item} timeZone={timeZone} />
      ))}
    </ul>
  );
}
