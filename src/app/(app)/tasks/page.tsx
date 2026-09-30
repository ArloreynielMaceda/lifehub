import { ListChecks, Repeat, SearchX } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { TASK_PAGE_SIZE, type TaskScope } from "@/features/tasks/constants";
import { RoutineList, TodayRoutines } from "@/features/tasks/components/routine-list";
import { TaskCalendar } from "@/features/tasks/components/task-calendar";
import { NewTaskButton, TaskEditorProvider } from "@/features/tasks/components/task-editor";
import { TaskList } from "@/features/tasks/components/task-list";
import { TaskToolbar } from "@/features/tasks/components/task-toolbar";
import {
  getRoutineOccurrences,
  getRoutineViews,
  getTaskCategories,
  getTaskCounts,
  listTasks,
  listTasksInRange,
} from "@/features/tasks/queries";
import { parseTaskFilters } from "@/features/tasks/schemas";
import { getUserContext } from "@/lib/auth";
import { calendarGrid } from "@/lib/calendar";
import { flattenSearchParams } from "@/lib/validation";

export const metadata: Metadata = { title: "Tasks" };

const EMPTY_COPY: Record<TaskScope, { title: string; description: string }> = {
  open: { title: "No open tasks", description: "Add what's on your mind and give it a due date so it shows up on your dashboard." },
  today: { title: "Nothing due today", description: "Enjoy the breathing room, or plan something for today." },
  overdue: { title: "Nothing overdue", description: "You're on top of things." },
  upcoming: { title: "Nothing scheduled ahead", description: "Tasks with a future due date will appear here." },
  completed: { title: "No completed tasks yet", description: "Tick off a task and it will move here." },
  all: { title: "No tasks yet", description: "Create your first task to get started." },
  routines: {
    title: "No routines yet",
    description: "Add things you do regularly — take vitamins, exercise, read — and tick them off each day without re-creating them.",
  },
};

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const raw = await searchParams;
  const filters = parseTaskFilters(raw);
  const page = parsePage(raw.page);
  const { today } = await getUserContext();

  const [categories, counts, routines] = await Promise.all([
    getTaskCategories(),
    getTaskCounts(today),
    getRoutineViews(today, filters),
  ]);
  const hasFilters = Boolean(filters.q || filters.priority || filters.category || filters.status);
  const routinesDueToday = routines.filter((r) => r.scheduledToday && !r.paused && !r.completedToday).length;

  let content: React.ReactNode;
  if (filters.view === "calendar") {
    const month = `${filters.month ?? today.slice(0, 7)}-01`;
    const grid = calendarGrid(month);
    const [tasks, occurrences] = await Promise.all([
      filters.scope === "routines" ? Promise.resolve([]) : listTasksInRange(filters, grid.start, grid.end),
      filters.scope === "completed" ? Promise.resolve([]) : getRoutineOccurrences(grid.start, grid.end, filters),
    ]);
    const baseQuery = new URLSearchParams(
      Object.entries(flattenSearchParams(raw)).filter(
        (entry): entry is [string, string] => Boolean(entry[1]) && !["view", "month", "page", "new"].includes(entry[0]),
      ),
    ).toString();
    content = <TaskCalendar month={month} today={today} tasks={tasks} routines={occurrences} baseQuery={baseQuery} />;
  } else if (filters.scope === "routines") {
    content =
      routines.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={<SearchX />} title="No routines match your filters" description="Try a different search or clear some filters." />
        ) : (
          <EmptyState
            icon={<Repeat />}
            title={EMPTY_COPY.routines.title}
            description={EMPTY_COPY.routines.description}
            action={<NewTaskButton kind="routine" label="Add a routine" />}
          />
        )
      ) : (
        <RoutineList routines={routines} today={today} />
      );
  } else {
    const { tasks, total } = await listTasks(filters, today, page);
    const copy = EMPTY_COPY[filters.scope];
    const showTodayRoutines = (filters.scope === "open" || filters.scope === "today") && page === 1;
    content = (
      <div className="space-y-4">
        {showTodayRoutines ? <TodayRoutines routines={routines} today={today} /> : null}
        {tasks.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<SearchX />}
              title="No tasks match your filters"
              description="Try a different search or clear some filters."
            />
          ) : (
            <EmptyState
              icon={<ListChecks />}
              title={copy.title}
              description={copy.description}
              action={filters.scope !== "completed" ? <NewTaskButton label="Add a task" /> : undefined}
            />
          )
        ) : (
          <div>
            <TaskList tasks={tasks} today={today} />
            <Pagination
              page={page}
              pageSize={TASK_PAGE_SIZE}
              total={total}
              basePath="/tasks"
              searchParams={flattenSearchParams(raw)}
              itemLabel="tasks"
            />
          </div>
        )}
      </div>
    );
  }

  const parts = [
    counts.open ? `${counts.open} open` : null,
    counts.today ? `${counts.today} due today` : null,
    counts.overdue ? `${counts.overdue} overdue` : null,
    routinesDueToday ? `${routinesDueToday} routine${routinesDueToday === 1 ? "" : "s"} to do today` : null,
  ].filter(Boolean);
  const description = parts.length ? parts.join(" · ") : "Everything you need to get done, in one list.";

  return (
    <TaskEditorProvider categories={categories} today={today}>
      <PageHeader
        title="Tasks"
        description={description}
        actions={
          <>
            <NewTaskButton kind="routine" label="New routine" variant="outline" />
            <NewTaskButton />
          </>
        }
      />
      <div className="space-y-5">
        <TaskToolbar
          filters={filters}
          categories={categories}
          counts={{ open: counts.open, today: counts.today, overdue: counts.overdue, routines: routinesDueToday }}
        />
        {content}
      </div>
    </TaskEditorProvider>
  );
}
