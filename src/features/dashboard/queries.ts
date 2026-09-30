import "server-only";

import { getDueSoon } from "@/features/bills/queries";
import { getFocusTasks, getRoutineViews, getTaskCategories, getTaskCounts } from "@/features/tasks/queries";
import { getMoneyOverview, getRecentTransactions } from "@/features/transactions/queries";
import { addDays, endOfMonth, startOfMonth, startOfWeek, type ISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export interface WeekDay {
  date: ISODate;
  tasks: number;
  bills: number;
  reminders: number;
}

async function getWeekLoad(today: ISODate): Promise<WeekDay[]> {
  const supabase = await createClient();
  const start = startOfWeek(today);
  const end = addDays(start, 6);
  const [tasks, bills] = await Promise.all([
    supabase
      .from("tasks")
      .select("due_date")
      .eq("kind", "task")
      .neq("status", "completed")
      .gte("due_date", start)
      .lte("due_date", end)
      .limit(500),
    supabase.from("bills").select("next_due_date, kind").eq("status", "active").gte("next_due_date", start).lte("next_due_date", end).limit(500),
  ]);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return {
      date,
      tasks: (tasks.data ?? []).filter((row) => row.due_date === date).length,
      bills: (bills.data ?? []).filter((row) => row.next_due_date === date && row.kind === "bill").length,
      reminders: (bills.data ?? []).filter((row) => row.next_due_date === date && row.kind === "reminder").length,
    };
  });
}

/** Everything the dashboard shows, fetched in parallel from real user data. */
export async function getDashboardData(today: ISODate, currency: string) {
  const monthEnd = endOfMonth(today);
  const [counts, focusTasks, routines, categories, bills, reminders, money, recent, week] = await Promise.all([
    getTaskCounts(today),
    getFocusTasks(today, 6),
    getRoutineViews(today),
    getTaskCategories(),
    getDueSoon(today, "bill", 5, 14),
    getDueSoon(today, "reminder", 5, 14),
    getMoneyOverview(startOfMonth(today), monthEnd, today, currency),
    getRecentTransactions(5),
    getWeekLoad(today),
  ]);
  return {
    counts,
    focusTasks,
    routines,
    categories,
    bills,
    reminders,
    money,
    monthEnd,
    recent,
    week,
  };
}
