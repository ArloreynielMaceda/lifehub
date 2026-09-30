"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { formatISODate } from "@/lib/dates";
import { formatMoney, minorToChartValue } from "@/lib/money";

import type { CategorySlice, TrendPoint } from "../queries";

/*
 * Chart conventions (see the dataviz method): one hue per series, validated palette
 * (--chart-1 income/single series, --chart-2 expense), <= 24px bars with 4px rounded data
 * ends, hairline solid gridlines, text in ink tokens (never series colours), a legend for
 * two series, tooltips that enhance but never gate — each chart has a table-view twin.
 */

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

function compactMoney(value: number, currency: string): string {
  // Axis ticks only (display of clean tick values, never used for arithmetic).
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function TableView({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex cursor-pointer items-center rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Show as table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------------- */
/* Expense breakdown by category — one series, horizontal bars, sorted.       */
/* ------------------------------------------------------------------------- */

interface CategoryRow {
  category: string;
  value: number;
  minor: number;
}

function CategoryTooltip({ active, payload, currency, total }: TooltipContentProps & { currency: string; total: number }) {
  const row = payload?.[0]?.payload as CategoryRow | undefined;
  if (!active || !row) return null;
  const share = total > 0 ? Math.round((row.minor / total) * 100) : 0;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-sm font-semibold">{formatMoney(row.minor, currency)}</p>
      <p className="text-muted-foreground">
        {row.category} · {share}% of spending
      </p>
    </div>
  );
}

function CategoryTick({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) {
  const text = payload?.value ?? "";
  const short = text.length > 16 ? `${text.slice(0, 15)}…` : text;
  return (
    <text x={Number(x) - 8} y={Number(y)} dy={4} textAnchor="end" fontSize={12} fill="var(--muted-foreground)">
      <title>{text}</title>
      {short}
    </text>
  );
}

export function CategoryBreakdownChart({
  data,
  currency,
  rangeLabel,
}: {
  data: CategorySlice[];
  currency: string;
  rangeLabel: string;
}) {
  const total = data.reduce((sum, row) => sum + row.minor, 0);
  const rows: CategoryRow[] = data.map((row) => ({
    category: row.category,
    minor: row.minor,
    value: minorToChartValue(row.minor, currency),
  }));
  const height = Math.max(rows.length * 36, 72);

  return (
    <figure className="flex h-full flex-col rounded-xl border bg-card p-4 sm:p-5">
      <figcaption className="mb-4">
        <p className="text-sm font-semibold">Spending by category</p>
        <p className="text-xs text-muted-foreground">
          {rangeLabel} · {currency}
        </p>
      </figcaption>
      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No expenses in this period yet.
        </p>
      ) : (
        <>
          <div style={{ height }} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 84, bottom: 0, left: 8 }} barCategoryGap={10}>
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={120}
                  tickLine={false}
                  axisLine={false}
                  tick={<CategoryTick />}
                  interval={0}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.7 }}
                  content={(props) => <CategoryTooltip {...props} currency={currency} total={total} />}
                />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                  <LabelList
                    dataKey="minor"
                    position="right"
                    offset={8}
                    fontSize={12}
                    fill="var(--foreground)"
                    formatter={(value) => formatMoney(Number(value), currency)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableView caption={`Spending by category, ${rangeLabel}`}>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 font-medium">Category</th>
                <th scope="col" className="py-1 text-right font-medium">Amount</th>
                <th scope="col" className="py-1 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((row) => (
                <tr key={row.category} className="border-t">
                  <th scope="row" className="py-1.5 font-normal">{row.category}</th>
                  <td className="py-1.5 text-right">{formatMoney(row.minor, currency)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {total > 0 ? Math.round((row.minor / total) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </TableView>
        </>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------------- */
/* Monthly trend — income vs expenses, grouped columns (two series, one axis) */
/* ------------------------------------------------------------------------- */

interface TrendRow {
  month: string;
  label: string;
  income: number;
  expense: number;
  incomeMinor: number;
  expenseMinor: number;
}

const SERIES = [
  { key: "income", label: "Income", color: "var(--chart-1)" },
  { key: "expense", label: "Expenses", color: "var(--chart-2)" },
] as const;

function TrendTooltip({ active, payload, currency }: TooltipContentProps & { currency: string }) {
  const row = payload?.[0]?.payload as TrendRow | undefined;
  if (!active || !row) return null;
  const net = row.incomeMinor - row.expenseMinor;
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-muted-foreground">{formatISODate(`${row.month}-01`, "month")}</p>
      <ul className="space-y-1">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: series.color }} aria-hidden="true" />
            <span className="text-sm font-semibold">
              {formatMoney(series.key === "income" ? row.incomeMinor : row.expenseMinor, currency)}
            </span>
            <span className="text-muted-foreground">{series.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t pt-1.5 text-muted-foreground">
        Net <span className="font-semibold text-foreground">{formatMoney(net, currency)}</span>
      </p>
    </div>
  );
}

export function MonthlyTrendChart({ data, currency }: { data: TrendPoint[]; currency: string }) {
  const rows: TrendRow[] = data.map((point) => ({
    month: point.month,
    label: formatISODate(`${point.month}-01`, "short").split(" ")[0]!,
    income: minorToChartValue(point.income, currency),
    expense: minorToChartValue(point.expense, currency),
    incomeMinor: point.income,
    expenseMinor: point.expense,
  }));
  const hasData = rows.some((row) => row.incomeMinor > 0 || row.expenseMinor > 0);
  const first = rows[0] ? formatISODate(`${rows[0].month}-01`, "month") : "";
  const last = rows.at(-1) ? formatISODate(`${rows.at(-1)!.month}-01`, "month") : "";

  return (
    <figure className="flex h-full flex-col rounded-xl border bg-card p-4 sm:p-5">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Income vs expenses</p>
          <p className="text-xs text-muted-foreground">
            {first} – {last} · {currency}
          </p>
        </div>
        <ul className="flex items-center gap-4 text-xs text-muted-foreground" aria-label="Legend">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: series.color }} aria-hidden="true" />
              {series.label}
            </li>
          ))}
        </ul>
      </figcaption>
      {!hasData ? (
        <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Log income and expenses to see your monthly trend.
        </p>
      ) : (
        <>
          <div className="h-60" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 240 }}>
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={AXIS_TICK} />
                <YAxis
                  width={60}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={(value: number) => compactMoney(value, currency)}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                  content={(props) => <TrendTooltip {...props} currency={currency} />}
                />
                {SERIES.map((series) => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label}
                    fill={series.color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={20}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableView caption="Monthly income and expenses">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 font-medium">Month</th>
                <th scope="col" className="py-1 text-right font-medium">Income</th>
                <th scope="col" className="py-1 text-right font-medium">Expenses</th>
                <th scope="col" className="py-1 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((row) => (
                <tr key={row.month} className="border-t">
                  <th scope="row" className="py-1.5 font-normal">{formatISODate(`${row.month}-01`, "month")}</th>
                  <td className="py-1.5 text-right">{formatMoney(row.incomeMinor, currency)}</td>
                  <td className="py-1.5 text-right">{formatMoney(row.expenseMinor, currency)}</td>
                  <td className="py-1.5 text-right">{formatMoney(row.incomeMinor - row.expenseMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </TableView>
        </>
      )}
    </figure>
  );
}
