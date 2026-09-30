"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { markAllNotificationsRead, markNotificationRead } from "../actions";
import type { NotificationItem } from "../queries";
import { NotificationRow } from "./notification-item";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsRead();
          if (result.ok) toast.success(result.message ?? "All caught up");
          else toast.error(result.error);
        })
      }
    >
      {pending ? <Spinner aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
      Mark all as read
    </Button>
  );
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  return (
    <ul role="list" className="divide-y overflow-hidden rounded-xl border bg-card p-1.5">
      {items.map((item) => (
        <li key={item.id} className="py-0.5">
          <NotificationRow
            item={item}
            onOpen={(entry) => {
              if (!entry.read_at) void markNotificationRead(entry.id);
              router.push(entry.link ?? "/dashboard");
            }}
          />
        </li>
      ))}
    </ul>
  );
}
