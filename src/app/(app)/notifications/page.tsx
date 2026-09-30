import { BellOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterTabs } from "@/components/shared/filter-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { MarkAllReadButton, NotificationList } from "@/features/notifications/components/notification-list";
import { getNotificationSummary, listNotifications } from "@/features/notifications/queries";
import { getUserContext } from "@/lib/auth";
import { flattenSearchParams, one } from "@/lib/validation";

export const metadata: Metadata = { title: "Notifications" };

const PAGE_SIZE = 25;

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const raw = await searchParams;
  const filter = one(raw.filter) === "unread" ? "unread" : "all";
  const page = parsePage(raw.page);
  const { timezone } = await getUserContext();
  const [{ items, total }, summary] = await Promise.all([
    listNotifications(timezone, page, PAGE_SIZE, filter),
    getNotificationSummary(timezone, 1),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Due and overdue tasks, bills and reminders. Read notifications are cleared after 90 days."
        actions={<MarkAllReadButton disabled={summary.unreadCount === 0} />}
      />
      <div className="max-w-3xl space-y-4">
        <FilterTabs
          param="filter"
          label="Notification filters"
          value={filter}
          defaultValue="all"
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread" },
          ]}
          counts={{ unread: summary.unreadCount }}
        />
        {items.length === 0 ? (
          <EmptyState
            icon={<BellOff />}
            title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
            description="When a task, bill or reminder is due soon, due today or overdue, you'll see it here."
          />
        ) : (
          <NotificationList items={items} />
        )}
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath="/notifications"
          searchParams={flattenSearchParams(raw)}
          itemLabel="notifications"
        />
      </div>
    </>
  );
}
