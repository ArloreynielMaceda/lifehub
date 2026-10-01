import {
  BellRing,
  CalendarDays,
  FileUp,
  ListChecks,
  NotebookPen,
  Plus,
  Receipt,
  Repeat,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CompanionFigure, CompanionNote } from "@/components/companion/companion";
import { Money } from "@/components/shared/money";
import { CompactBillRow } from "@/features/bills/components/bill-list";
import { CardEmpty, DashboardCard } from "@/features/dashboard/components/dashboard-card";
import { WeekStrip } from "@/features/dashboard/components/week-strip";
import {
  MOMENT_COMPANION,
  MOMENT_POSE,
  dashboardMoment,
  dashboardSummary,
  type DayProgress,
} from "@/features/dashboard/moment";
import { getDashboardData } from "@/features/dashboard/queries";
import { TodayRoutines } from "@/features/tasks/components/routine-list";
import { NewTaskButton, TaskEditorProvider } from "@/features/tasks/components/task-editor";
import { TaskRow } from "@/features/tasks/components/task-list";
import { MoneyOverviewPanel } from "@/features/transactions/components/money-overview-panel";
import { TransactionTypeIcon } from "@/features/transactions/components/transaction-table";
import { firstName, getUserContext } from "@/lib/auth";
import { formatISODate, hourInTimeZone } from "@/lib/dates";

export const metadata: Metadata = { title: "Home" };

const QUICK_ACTIONS = [
  { href: "/tasks?new=1", label: "Task", icon: ListChecks },
  { href: "/tasks?new=routine", label: "Routine", icon: Repeat },
  { href: "/bills?new=bill", label: "Bill", icon: Receipt },
  { href: "/bills?new=reminder", label: "Reminder", icon: BellRing },
  { href: "/expenses?new=1", label: "Expense", icon: Wallet },
  { href: "/notes/new", label: "Note", icon: NotebookPen },
  { href: "/documents?upload=1", label: "Document", icon: FileUp },
];

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const { user, profile, today, timezone, currency } = await getUserContext();
  const data = await getDashboardData(today, currency);
  const name = firstName(profile, user.email);
  const routinesToday = data.routines.filter((routine) => routine.scheduledToday && !routine.paused);
  const routinesLeft = routinesToday.filter((routine) => !routine.completedToday).length;
  const money = data.money.primary;
  const hasMoney = money.hasActivity || data.money.others.length > 0;
  const hour = hourInTimeZone(timezone);
  const progress: DayProgress = {
    hour,
    tasksDueToday: data.counts.today,
    overdue: data.counts.overdue,
    tasksDoneToday: data.tasksDoneToday,
    routinesScheduled: routinesToday.length,
    routinesLeft,
    billsComingUp: data.bills.length,
  };
  const moment = dashboardMoment(progress);
  const summary = dashboardSummary(progress);

  return (
    <TaskEditorProvider categories={data.categories} today={today}>
      {/* Welcome area: greeting, today's summary and quick actions. On tablet and up the
          half-body companion sits on the right (about a quarter of the width); on phones the
          small face says the summary instead, so the cards stay in view. */}
      <header className="grid grid-cols-1 pb-8 md:mb-6 md:grid-cols-[minmax(0,1fr)_14rem] md:overflow-hidden md:rounded-3xl md:border md:bg-card md:pb-0 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="md:p-7 lg:p-8">
          <p className="eyebrow">{formatISODate(today, "long")}</p>
          <h1 className="mt-3 font-display text-[2.6rem] leading-[1.02] tracking-tight sm:text-[3.4rem]">
            {greeting(hour)}, {name}
          </h1>
          <CompanionNote {...MOMENT_COMPANION[moment]} className="mt-4 max-w-xl md:hidden">
            {summary}
          </CompanionNote>
          <p className="mt-3 hidden max-w-xl text-[0.95rem] text-muted-foreground md:block">{summary}</p>
          <nav aria-label="Quick add" className="mt-6 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Plus className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div aria-hidden="true" className="relative hidden items-end justify-center md:flex">
          <span className="absolute inset-0 bg-companion-glow" />
          <CompanionFigure pose={MOMENT_POSE[moment]} eager className="relative h-[11.5rem] lg:h-[12.75rem]" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DashboardCard title="Today" icon={<ListChecks />} href="/tasks?scope=today" linkLabel="All tasks" headingId="today-heading">
            {routinesToday.length > 0 ? (
              <TodayRoutines routines={data.routines} today={today} bare className={data.focusTasks.length ? "mb-3 border-b pb-3" : ""} />
            ) : null}
            {data.focusTasks.length === 0 ? (
              routinesToday.length > 0 ? null : (
                <CardEmpty action={<NewTaskButton label="Add a task" variant="outline" size="sm" />}>
                  Nothing due today. Tasks with today&apos;s date or earlier and today&apos;s routines show up here.
                </CardEmpty>
              )
            ) : (
              <>
                <ul role="list" className="-mx-4 divide-y border-y sm:-mx-5">
                  {data.focusTasks.map((task) => (
                    <TaskRow key={task.id} task={task} today={today} />
                  ))}
                </ul>
                {data.counts.today + data.counts.overdue > data.focusTasks.length ? (
                  <p className="pt-3 text-xs text-muted-foreground">
                    +{data.counts.today + data.counts.overdue - data.focusTasks.length} more on the{" "}
                    <Link href="/tasks?scope=overdue" className="font-medium text-foreground underline-offset-4 hover:underline">
                      tasks page
                    </Link>
                  </p>
                ) : null}
              </>
            )}
          </DashboardCard>

          <DashboardCard
            title={`${formatISODate(today, "month")} money`}
            icon={<Wallet />}
            href="/expenses"
            linkLabel="Expenses"
            headingId="money-heading"
          >
            {!hasMoney ? (
              <CardEmpty
                action={
                  <Link href="/expenses?new=1" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Log a transaction
                  </Link>
                }
              >
                No income or expenses recorded this month yet.
              </CardEmpty>
            ) : (
              <MoneyOverviewPanel result={data.money} periodEnd={data.monthEnd} size="md" />
            )}
          </DashboardCard>

          <DashboardCard title="Recent transactions" icon={<Receipt />} href="/expenses" headingId="recent-heading">
            {data.recent.length === 0 ? (
              <CardEmpty>Your latest income and expenses will appear here.</CardEmpty>
            ) : (
              <ul role="list" className="divide-y">
                {data.recent.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-3 py-2.5">
                    <TransactionTypeIcon type={tx.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatISODate(tx.occurred_on, "short")} · {tx.category}
                      </p>
                    </div>
                    <Money minor={tx.amount_minor} currency={tx.currency} signed tone={tx.type} className="text-sm font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>

        <div className="space-y-4">
          <DashboardCard title="This week" icon={<CalendarDays />} href="/tasks?view=calendar" linkLabel="Calendar" headingId="week-heading">
            <WeekStrip days={data.week} today={today} />
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-foreground/70" /> Tasks</span>
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" /> Bills</span>
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-info" /> Reminders</span>
            </p>
          </DashboardCard>

          <DashboardCard title="Upcoming bills" icon={<Receipt />} href="/bills" headingId="bills-heading">
            {data.bills.length === 0 ? (
              <CardEmpty
                action={
                  <Link href="/bills?new=bill" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Add a bill
                  </Link>
                }
              >
                No bills due in the next two weeks.
              </CardEmpty>
            ) : (
              <ul role="list" className="divide-y">
                {data.bills.map((bill) => (
                  <CompactBillRow key={bill.id} bill={bill} today={today} />
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard title="Reminders" icon={<BellRing />} href="/bills?kind=reminder" headingId="reminders-heading">
            {data.reminders.length === 0 ? (
              <CardEmpty
                action={
                  <Link href="/bills?new=reminder" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Add a reminder
                  </Link>
                }
              >
                No reminders in the next two weeks.
              </CardEmpty>
            ) : (
              <ul role="list" className="divide-y">
                {data.reminders.map((reminder) => (
                  <CompactBillRow key={reminder.id} bill={reminder} today={today} />
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>
      </div>
    </TaskEditorProvider>
  );
}
