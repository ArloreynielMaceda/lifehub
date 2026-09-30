import { CalendarClock, Wallet } from "lucide-react";

import { formatISODate, type ISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { MoneyOverview } from "@/lib/money-overview";
import { cn } from "@/lib/utils";

import type { MoneyOverviewResult } from "../queries";

function Row({
  label,
  minor,
  currency,
  sign,
  muted,
}: {
  label: React.ReactNode;
  minor: number;
  currency: string;
  sign?: "minus";
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className={cn("text-sm", muted ? "text-muted-foreground" : "text-foreground/80")}>{label}</dt>
      <dd className={cn("tabular text-sm font-medium whitespace-nowrap", muted && "text-muted-foreground")}>
        {sign === "minus" && minor !== 0 ? "−" : ""}
        {formatMoney(minor, currency)}
      </dd>
    </div>
  );
}

function Total({ label, minor, currency, size }: { label: string; minor: number; currency: string; size: "lg" | "md" }) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-3 border-t pt-3">
      <dt className="text-sm font-semibold">{label}</dt>
      <dd
        className={cn(
          "font-semibold tracking-tight whitespace-nowrap",
          size === "lg" ? "text-2xl" : "text-xl",
          minor < 0 && "text-destructive",
        )}
      >
        {formatMoney(minor, currency)}
      </dd>
    </div>
  );
}

function OverviewBlocks({
  overview,
  showsPlanned,
  periodEnd,
  size,
}: {
  overview: MoneyOverview;
  showsPlanned: boolean;
  periodEnd: ISODate;
  size: "lg" | "md";
}) {
  const { currency } = overview;
  return (
    <div className={cn("grid grid-cols-1 gap-3", showsPlanned && "md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]")}>
      <section aria-label="Actual money" className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="eyebrow flex items-center gap-1.5">
          <Wallet className="size-3.5" aria-hidden="true" /> Actual
        </p>
        <dl className="mt-2">
          <Row label="Income" minor={overview.income} currency={currency} />
          <Row label="Paid bills" minor={overview.paidBills} currency={currency} sign="minus" />
          <Row label="Other expenses" minor={overview.otherExpenses} currency={currency} sign="minus" />
          <Total label="Available now" minor={overview.availableNow} currency={currency} size={size} />
        </dl>
      </section>
      {showsPlanned ? (
        <section aria-label="Planned" className="rounded-xl border border-dashed bg-canvas/60 p-4 sm:p-5">
          <p className="eyebrow flex items-center gap-1.5">
            <CalendarClock className="size-3.5" aria-hidden="true" /> Planned
          </p>
          <dl className="mt-2">
            <Row
              label={
                <>
                  Upcoming bills{" "}
                  <span className="text-muted-foreground">
                    ({overview.upcomingCount} unpaid)
                  </span>
                </>
              }
              minor={overview.upcomingBills}
              currency={currency}
              sign="minus"
            />
            <Total label="After upcoming bills" minor={overview.afterUpcoming} currency={currency} size={size} />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            {overview.upcomingCount
              ? `Unpaid bills due by ${formatISODate(periodEnd, "short")}. They aren't counted as spent until you mark them paid.`
              : `No unpaid bills with an amount due by ${formatISODate(periodEnd, "short")}.`}
          </p>
        </section>
      ) : null}
    </div>
  );
}

/**
 * "Available now" (actual transactions; paid bills counted once) and "After upcoming bills"
 * (planned). Other currencies are listed separately — amounts are never converted.
 */
export function MoneyOverviewPanel({
  result,
  periodEnd,
  size = "lg",
}: {
  result: MoneyOverviewResult;
  periodEnd: ISODate;
  size?: "lg" | "md";
}) {
  return (
    <div className="space-y-3">
      <OverviewBlocks overview={result.primary} showsPlanned={result.showsPlanned} periodEnd={periodEnd} size={size} />
      {result.others.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Also recorded in other currencies (not converted)</summary>
          <div className="mt-3 space-y-3">
            {result.others.map((overview) => (
              <div key={overview.currency}>
                <p className="mb-1 font-medium text-foreground">{overview.currency}</p>
                <OverviewBlocks overview={overview} showsPlanned={result.showsPlanned} periodEnd={periodEnd} size="md" />
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
