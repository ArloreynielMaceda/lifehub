import { CalendarDays, ListChecks, Receipt, Wallet } from "lucide-react";

import { CompanionNote } from "@/components/companion/companion";
import { DueLabel } from "@/components/shared/due-label";
import { Money } from "@/components/shared/money";
import { BillKindIcon } from "@/features/bills/components/bill-list";
import { WeekStrip } from "@/features/dashboard/components/week-strip";
import { PriorityBadge } from "@/features/tasks/components/task-badges";
import { addDays, formatISODate, startOfWeek, type ISODate } from "@/lib/dates";

/**
 * A static preview of the real dashboard, rendered from the same components the app uses.
 * The content is illustrative sample data and is labelled as such on the page.
 */
export function ProductPreview({ today }: { today: ISODate }) {
  const start = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(start, i),
    tasks: [1, 2, 0, 1, 3, 0, 0][i]!,
    bills: [0, 1, 0, 0, 1, 0, 0][i]!,
    reminders: [0, 0, 1, 0, 0, 1, 0][i]!,
  }));
  const tasks = [
    { title: "Submit scholarship requirements", priority: "high" as const, due: today, category: "School" },
    { title: "Book dentist appointment", priority: "medium" as const, due: addDays(today, 1), category: "Health" },
    { title: "Send monthly report", priority: "low" as const, due: addDays(today, 3), category: "Work" },
  ];
  const bills = [
    { title: "Electricity", amount: 285_050, due: addDays(today, 2), kind: "bill" as const },
    { title: "Home internet", amount: 169_900, due: addDays(today, 5), kind: "bill" as const },
    { title: "Renew passport", amount: null, due: addDays(today, 9), kind: "reminder" as const },
  ];

  return (
    <div className="@container overflow-hidden rounded-2xl border bg-canvas shadow-[0_24px_60px_-30px_rgba(20,40,30,0.25)]">
      <div className="flex items-center gap-1.5 border-b bg-card px-4 py-2.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 rounded-md bg-muted px-3 py-0.5 text-[11px] text-muted-foreground">lifehub.app/dashboard</span>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 sm:p-5 @2xl:grid-cols-5">
        <div className="space-y-3 @2xl:col-span-3">
          <div className="px-1 pb-1">
            <p className="eyebrow">{formatISODate(today, "long")}</p>
            <p className="mt-1 font-display text-3xl">Good morning, Ana</p>
            <CompanionNote mood="happy" className="mt-3 [&_.text-sm]:text-[0.8rem]">
              You have 1 task due today, 2 bills coming up.
            </CompanionNote>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" /> Today
            </p>
            <ul className="divide-y">
              {tasks.map((task, index) => (
                <li key={task.title} className="flex items-start gap-3 py-2.5">
                  <span
                    className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${index === 2 ? "border-primary bg-primary" : "border-input"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <DueLabel date={task.due} today={today} />
                      <PriorityBadge priority={task.priority} />
                      <span className="text-xs text-muted-foreground">{task.category}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-4">
            <p className="col-span-3 mb-1 flex items-center gap-2 text-sm font-semibold">
              <Wallet className="size-4 text-muted-foreground" aria-hidden="true" /> This month
            </p>
            {[
              { label: "Income", value: 4_250_000 },
              { label: "Expenses", value: 2_874_550 },
              { label: "Net", value: 1_375_450 },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <Money
                  minor={item.value}
                  currency="PHP"
                  className={`text-sm font-semibold sm:text-base ${item.label === "Net" ? "text-success" : ""}`}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 @2xl:col-span-2">
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" /> This week
            </p>
            <WeekStrip days={week} today={today} />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Receipt className="size-4 text-muted-foreground" aria-hidden="true" /> Coming up
            </p>
            <ul className="divide-y">
              {bills.map((bill) => (
                <li key={bill.title} className="flex items-center gap-3 py-2.5">
                  <BillKindIcon kind={bill.kind} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{bill.title}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs">
                      <DueLabel date={bill.due} today={today} />
                      {bill.amount ? <Money minor={bill.amount} currency="PHP" className="font-semibold text-foreground" /> : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
