import { CalendarClock, CircleAlert, CircleCheck, History, SearchX } from "lucide-react";
import type { Metadata } from "next";

import { CompanionBanner, CompanionNote } from "@/components/companion/companion";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { StatTile } from "@/components/shared/stat-tile";
import { BILL_PAGE_SIZE, UPCOMING_WINDOW_DAYS } from "@/features/bills/constants";
import { BillEditorProvider, NewBillButton } from "@/features/bills/components/bill-editor";
import { BillHistory } from "@/features/bills/components/bill-history";
import { BillList } from "@/features/bills/components/bill-list";
import { BillToolbar } from "@/features/bills/components/bill-toolbar";
import { billNudge } from "@/features/bills/nudge";
import { getBillOverview, getNextDue, listBillHistory, listBills } from "@/features/bills/queries";
import { parseBillFilters } from "@/features/bills/schemas";
import { getUserContext } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { flattenSearchParams } from "@/lib/validation";

export const metadata: Metadata = { title: "Bills & reminders" };

function totalsText(entries: { currency: string; total: number }[], fallbackCurrency: string): string {
  if (entries.length === 0) return formatMoney(0, fallbackCurrency);
  return entries.map((entry) => formatMoney(entry.total, entry.currency)).join(" + ");
}

export default async function BillsPage({ searchParams }: PageProps<"/bills">) {
  const raw = await searchParams;
  const filters = parseBillFilters(raw);
  const page = parsePage(raw.page);
  const { today, currency, timezone } = await getUserContext();
  const [overview, nextDue] = await Promise.all([getBillOverview(today), getNextDue()]);
  const nudge = billNudge(nextDue, today, overview.overdueCount);
  const hasFilters = Boolean(filters.q || filters.kind);

  const overdueTotals = overview.byCurrency
    .filter((row) => row.overdue_total_minor > 0)
    .map((row) => ({ currency: row.currency, total: row.overdue_total_minor }));
  const upcomingTotals = overview.byCurrency
    .filter((row) => row.upcoming_total_minor > 0)
    .map((row) => ({ currency: row.currency, total: row.upcoming_total_minor }));

  let list: React.ReactNode;
  let total = 0;
  if (filters.view === "paid") {
    const history = await listBillHistory(filters, page);
    total = history.total;
    list =
      history.items.length === 0 ? (
        <EmptyState
          icon={<History />}
          title={hasFilters ? "No history matches your filters" : "No payments recorded yet"}
          description="When you mark a bill paid or a reminder done, it's recorded here."
        />
      ) : (
        <BillHistory items={history.items} timeZone={timezone} />
      );
  } else {
    const result = await listBills(filters, today, page);
    total = result.total;
    list =
      result.bills.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={<SearchX />} title="Nothing matches your filters" description="Try another search or type." />
        ) : filters.view === "overdue" ? (
          <EmptyState
            icon={<CircleCheck />}
            companion={nudge ? undefined : { mood: "wink", badge: "check" }}
            title="Nothing overdue"
            description="Every bill and reminder is on track."
          />
        ) : (
          <EmptyState
            icon={<CalendarClock />}
            companion={nudge ? undefined : { mood: "calm", badge: "bell" }}
            title={filters.view === "upcoming" ? "Nothing coming up" : "No bills or reminders yet"}
            description="Add rent, utilities, subscriptions or any date you don't want to miss. Repeating items roll forward automatically when you mark them done."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <NewBillButton />
                <NewBillButton kind="reminder" variant="outline" />
              </div>
            }
          />
        )
      ) : (
        <BillList bills={result.bills} today={today} />
      );
  }

  return (
    <BillEditorProvider currency={currency} today={today}>
      <PageHeader
        title="Bills & reminders"
        description="Due dates for payments, renewals and anything else you can't afford to forget."
        actions={
          <>
            <NewBillButton kind="reminder" variant="outline" />
            <NewBillButton />
          </>
        }
      />
      <div className="space-y-6">
        {nudge?.urgent ? (
          <CompanionBanner
            pose="reminder"
            mood={nudge.mood}
            badge="bell"
            title={nudge.tone === "warning" ? "Overdue" : "Reminder"}
            tone={nudge.tone}
          >
            {nudge.text}
          </CompanionBanner>
        ) : nudge ? (
          <CompanionNote mood={nudge.mood} badge="bell" tone={nudge.tone}>
            {nudge.text}
          </CompanionNote>
        ) : null}
        <section aria-label="Summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Overdue"
            icon={<CircleAlert />}
            value={overview.overdueCount}
            tone={overview.overdueCount > 0 ? "negative" : "default"}
            hint={overdueTotals.length ? `${totalsText(overdueTotals, currency)} in bills` : "Nothing past due"}
          />
          <StatTile
            label={`Due in the next ${UPCOMING_WINDOW_DAYS} days`}
            icon={<CalendarClock />}
            value={overview.upcomingCount}
            hint={upcomingTotals.length ? `${totalsText(upcomingTotals, currency)} in bills` : "No amounts due"}
          />
          <StatTile
            label="Paid this month"
            icon={<CircleCheck />}
            value={overview.paidThisMonthCount}
            tone={overview.paidThisMonthCount > 0 ? "positive" : "default"}
            hint={overview.paidThisMonthTotals.length ? totalsText(overview.paidThisMonthTotals, currency) : "Nothing recorded yet"}
          />
        </section>
        <BillToolbar filters={filters} counts={{ overdue: overview.overdueCount }} />
        <div>
          {list}
          <Pagination
            page={page}
            pageSize={BILL_PAGE_SIZE}
            total={total}
            basePath="/bills"
            searchParams={flattenSearchParams(raw)}
            itemLabel={filters.view === "paid" ? "records" : "items"}
          />
        </div>
      </div>
    </BillEditorProvider>
  );
}
