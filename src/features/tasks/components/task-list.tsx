"use client";

import { CircleDot, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DueLabel } from "@/components/shared/due-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { deleteTask, setTaskStatus } from "../actions";
import type { TaskStatus } from "../constants";
import type { TaskItem } from "../queries";
import { PriorityBadge, StatusBadge } from "./task-badges";
import { useTaskEditor } from "./task-editor";

export function TaskRow({ task, today }: { task: TaskItem; today: ISODate }) {
  const { openEdit } = useTaskEditor();
  const [status, setOptimisticStatus] = useOptimistic<TaskStatus>(task.status);
  const [, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const done = status === "completed";

  const changeStatus = (next: TaskStatus, previous: TaskStatus = task.status) => {
    startTransition(async () => {
      setOptimisticStatus(next);
      const result = await setTaskStatus(task.id, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (next === "completed") {
        toast.success("Task completed", {
          action: { label: "Undo", onClick: () => void setTaskStatus(task.id, previous) },
        });
      }
    });
  };

  return (
    <li className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5">
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => changeStatus(checked === true ? "completed" : "pending")}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="mt-0.5 size-5 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => openEdit(task)}
          className="block max-w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <span
            className={cn(
              "block truncate text-sm font-medium",
              done && "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
          >
            {task.title}
          </span>
          {task.description ? (
            <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{task.description}</span>
          ) : null}
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <DueLabel date={task.due_date} today={today} done={done} showIcon />
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={status} />
          {task.category ? (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {task.category}
            </Badge>
          ) : null}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for "${task.title}"`} className="text-muted-foreground">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => openEdit(task)}>
            <Pencil aria-hidden="true" /> Edit
          </DropdownMenuItem>
          {status === "pending" ? (
            <DropdownMenuItem onSelect={() => changeStatus("in_progress")}>
              <CircleDot aria-hidden="true" /> Mark in progress
            </DropdownMenuItem>
          ) : null}
          {status !== "pending" ? (
            <DropdownMenuItem onSelect={() => changeStatus("pending")}>
              <RotateCcw aria-hidden="true" /> Mark as pending
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden="true" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this task?"
        description={`"${task.title}" will be permanently deleted. This can't be undone.`}
        onConfirm={async () => {
          const result = await deleteTask(task.id);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.message ?? "Task deleted");
        }}
      />
    </li>
  );
}

export function TaskList({ tasks, today }: { tasks: TaskItem[]; today: ISODate }) {
  return (
    <ul role="list" className="divide-y overflow-hidden rounded-xl border bg-card">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} today={today} />
      ))}
    </ul>
  );
}
