// TEMPORARY visual check for light/dark themes — delete before committing.
import { CalendarCheck2, ListTodo, Wallet } from "lucide-react";
import { Suspense } from "react";

import { CompanionBanner, CompanionFigure, CompanionNote } from "@/components/companion/companion";
import { DueLabel } from "@/components/shared/due-label";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterTabs } from "@/components/shared/filter-tabs";
import { StatTile } from "@/components/shared/stat-tile";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { MobileNav } from "@/components/app/mobile-nav";
import { QuickAddMenu } from "@/components/app/quick-add-menu";
import { Logo } from "@/components/shared/logo";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DashboardCard } from "@/features/dashboard/components/dashboard-card";
import { WeekStrip } from "@/features/dashboard/components/week-strip";
import { AppearancePicker } from "@/features/settings/components/appearance-picker";
import { CategoryBreakdownChart, MonthlyTrendChart } from "@/features/transactions/components/money-charts";
import type { ISODate } from "@/lib/dates";

const today = "2026-10-02" as ISODate;
const days = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map(
  (date, i) => ({ date: date as ISODate, tasks: i % 3, bills: i === 2 ? 1 : 0, reminders: i === 4 ? 1 : 0 }),
);

export default function ThemePreview() {
  return (
    <>
    <header id="app-header" className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-sm sm:px-5">
      <MobileNav name="Reyn" email="reyn@example.com" initials="R" />
      <Logo href="/dashboard" />
      <div className="ml-auto flex items-center gap-1.5">
        <QuickAddMenu />
        <ThemeToggle />
        <NotificationBell items={[]} unreadCount={3} />
      </div>
    </header>
    <div className="min-h-dvh bg-canvas p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6 rounded-2xl border bg-background p-4 sm:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Theme preview</h1>
          <ThemeToggle />
        </div>
        <section className="grid overflow-hidden rounded-3xl border bg-card md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="space-y-3 p-6">
            <p className="eyebrow">Friday, 2 October</p>
            <h2 className="font-display text-4xl">Good morning, Reyn</h2>
            <p className="text-muted-foreground">You have 3 tasks due today, 1 overdue, 2 routines to do.</p>
            <div className="flex flex-wrap gap-2">
              <Button>New task</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
            </div>
          </div>
          <div aria-hidden="true" className="relative hidden items-end justify-center md:flex">
            <span className="absolute inset-0 bg-companion-glow" />
            <CompanionFigure pose="goodmorning" eager className="relative h-[11.5rem]" />
          </div>
        </section>
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Available now" value="₱12,400.00" hint="After paid bills" icon={<Wallet />} />
          <StatTile label="Income" value="₱30,000.00" tone="positive" />
          <StatTile label="Spent" value="₱17,600.00" tone="negative" />
          <StatTile label="Due soon" value="2 bills" tone="warning" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <DashboardCard title="Today" icon={<ListTodo />} href="/tasks">
            <ul className="space-y-3 text-sm">
              {["Pay electricity", "Call the dentist", "Water the plants"].map((title, i) => (
                <li key={title} className="flex items-center gap-3">
                  <Checkbox defaultChecked={i === 2} aria-label={title} />
                  <span className={i === 2 ? "text-muted-foreground line-through" : ""}>{title}</span>
                  <DueLabel date={(i === 0 ? "2026-09-30" : "2026-10-02") as ISODate} today={today} className="ml-auto" />
                </li>
              ))}
            </ul>
          </DashboardCard>
          <DashboardCard title="This week" icon={<CalendarCheck2 />}>
            <WeekStrip days={days} today={today} />
          </DashboardCard>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Overdue</Badge>
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Paid</span>
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">Due soon</span>
          <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">Reminder</span>
          <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive">Overdue</span>
          <a href="#" className="text-sm font-medium text-primary underline underline-offset-4">A link</a>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Input placeholder="Search notes" className="max-w-xs" />
          <Switch defaultChecked aria-label="On" />
          <Switch aria-label="Off" />
          <Suspense>
            <FilterTabs
              param="f"
              label="Filter"
              value="all"
              defaultValue="all"
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "done", label: "Done" },
              ]}
              counts={{ all: 12, open: 4 }}
            />
          </Suspense>
        </div>
        <CompanionBanner pose="finance" mood="thinking" badge="chart" title="Insight">
          You&apos;ve spent 59% of this period&apos;s income, so ₱12,400.00 is still available.
        </CompanionBanner>
        <CompanionBanner pose="reminder" mood="calm" badge="bell" tone="warning" title="Coming up">
          Your electricity bill (₱2,450.00) is due tomorrow.
        </CompanionBanner>
        <CompanionNote mood="happy" badge="sunrise">Nothing urgent today. A good moment to plan ahead.</CompanionNote>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4">
            <MonthlyTrendChart
              currency="PHP"
              data={[
                { month: "2026-05", income: 3000000, expense: 2100000 },
                { month: "2026-06", income: 3000000, expense: 2600000 },
                { month: "2026-07", income: 3200000, expense: 1900000 },
                { month: "2026-08", income: 3000000, expense: 2800000 },
                { month: "2026-09", income: 3100000, expense: 2300000 },
                { month: "2026-10", income: 3000000, expense: 1760000 },
              ]}
            />
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <CategoryBreakdownChart
              currency="PHP"
              rangeLabel="This month"
              data={[
                { category: "Food", minor: 820000 },
                { category: "Transport", minor: 340000 },
                { category: "Utilities", minor: 300000 },
                { category: "Shopping", minor: 300000 },
              ]}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState illustration="planning" title="No notes yet" description="Jot down ideas, lists and anything worth keeping." action={<Button>New note</Button>} />
          <div className="rounded-2xl border bg-card p-5">
            <AppearancePicker />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
