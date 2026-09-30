import { SearchX, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { TRANSACTION_PAGE_SIZE } from "@/features/transactions/constants";
import { CategoryBreakdownChart, MonthlyTrendChart } from "@/features/transactions/components/money-charts";
import { MoneyOverviewPanel } from "@/features/transactions/components/money-overview-panel";
import {
  NewTransactionButton,
  TransactionEditorProvider,
} from "@/features/transactions/components/transaction-editor";
import { TransactionFilters } from "@/features/transactions/components/transaction-filters";
import { TransactionTable } from "@/features/transactions/components/transaction-table";
import {
  getExpenseBreakdown,
  getMoneyOverview,
  getMonthlyTrend,
  getTransactionCategories,
  listTransactions,
} from "@/features/transactions/queries";
import { parseTransactionFilters, resolveRange } from "@/features/transactions/schemas";
import { getUserContext } from "@/lib/auth";
import { formatISODate } from "@/lib/dates";
import { flattenSearchParams } from "@/lib/validation";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const raw = await searchParams;
  const { today, currency } = await getUserContext();
  const range = resolveRange(raw, today);
  const filters = parseTransactionFilters(raw);
  const page = parsePage(raw.page);

  const [money, breakdown, trend, categories, list] = await Promise.all([
    getMoneyOverview(range.from, range.to, today, currency),
    getExpenseBreakdown(range, currency),
    getMonthlyTrend(range.to < today ? range.to : today, currency),
    getTransactionCategories(),
    listTransactions(filters, range, page),
  ]);
  const hasFilters = Boolean(filters.q || filters.type || filters.category);
  const rangeText =
    range.preset === "custom" || range.preset === "last_3_months" || range.preset === "this_year"
      ? `${formatISODate(range.from, "medium")} – ${formatISODate(range.to, "medium")}`
      : formatISODate(range.from, "month");

  return (
    <TransactionEditorProvider currency={currency} today={today} usedCategories={categories}>
      <PageHeader
        title="Expenses"
        description="A simple, manual record of money in and out. Not connected to any bank."
        actions={<NewTransactionButton />}
      />
      <div className="space-y-6">
        <TransactionFilters range={range} filters={filters} categories={categories} />

        <section aria-labelledby="totals-heading" className="space-y-2">
          <h2 id="totals-heading" className="text-[0.95rem] font-semibold">
            {range.label} <span className="font-normal text-muted-foreground">· {rangeText}</span>
          </h2>
          <MoneyOverviewPanel result={money} periodEnd={range.to} />
        </section>

        <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CategoryBreakdownChart data={breakdown} currency={currency} rangeLabel={rangeText} />
          <MonthlyTrendChart data={trend} currency={currency} />
        </section>

        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="text-[0.95rem] font-semibold">
            Transaction history
          </h2>
          {list.transactions.length === 0 ? (
            hasFilters ? (
              <EmptyState icon={<SearchX />} title="No transactions match your filters" description="Try another search, type or category." />
            ) : (
              <EmptyState
                icon={<Wallet />}
                title="No transactions in this period"
                description="Log what you spend and earn to see totals and trends. It takes a few seconds per entry."
                action={<NewTransactionButton label="Log your first transaction" />}
              />
            )
          ) : (
            <>
              <TransactionTable transactions={list.transactions} />
              <Pagination
                page={page}
                pageSize={TRANSACTION_PAGE_SIZE}
                total={list.total}
                basePath="/expenses"
                searchParams={flattenSearchParams(raw)}
                itemLabel="transactions"
              />
            </>
          )}
        </section>
      </div>
    </TransactionEditorProvider>
  );
}
