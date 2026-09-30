"use client";

import { Plus, Repeat } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { TaskKind } from "../constants";
import type { RoutineItem, TaskItem } from "../queries";
import type { TaskFormValues } from "../schemas";
import { RoutineForm } from "./routine-form";
import { TaskForm } from "./task-form";

type EditableItem = TaskItem | RoutineItem;

interface TaskEditorState {
  open: boolean;
  item: EditableItem | null;
  kind: TaskKind;
  defaults?: Partial<TaskFormValues>;
  key: number;
}

interface TaskEditorApi {
  openCreate: (defaults?: Partial<TaskFormValues> & { kind?: TaskKind }) => void;
  openEdit: (item: EditableItem) => void;
}

const TaskEditorContext = createContext<TaskEditorApi | null>(null);

export function useTaskEditor(): TaskEditorApi {
  const api = useContext(TaskEditorContext);
  if (!api) throw new Error("useTaskEditor must be used inside <TaskEditorProvider>");
  return api;
}

function isRoutine(item: EditableItem | null): item is RoutineItem {
  return item?.kind === "routine";
}

/**
 * Owns the single create/edit dialog for tasks and routines on a page. Quick-add links open
 * it with `?new=1` (task) or `?new=routine`, then the parameter is removed.
 */
export function TaskEditorProvider({
  categories,
  today,
  children,
}: {
  categories: string[];
  today: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<TaskEditorState>({ open: false, item: null, kind: "task", key: 0 });

  const openCreate = useCallback((options?: Partial<TaskFormValues> & { kind?: TaskKind }) => {
    const { kind = "task", ...defaults } = options ?? {};
    setState((prev) => ({ open: true, item: null, kind, defaults, key: prev.key + 1 }));
  }, []);
  const openEdit = useCallback((item: EditableItem) => {
    setState((prev) => ({ open: true, item, kind: item.kind, key: prev.key + 1 }));
  }, []);

  useEffect(() => {
    const requested = searchParams.get("new");
    if (requested !== "1" && requested !== "routine") return;
    // Deferred so the dialog opens after hydration, then clear the quick-add flag.
    const timer = window.setTimeout(() => {
      openCreate({ kind: requested === "routine" ? "routine" : "task" });
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openCreate, pathname, router, searchParams]);

  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);
  const close = () => setState((prev) => ({ ...prev, open: false }));
  const creating = state.item === null;
  const noun = state.kind === "routine" ? "routine" : "task";

  return (
    <TaskEditorContext.Provider value={api}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{creating ? `New ${noun}` : `Edit ${noun}`}</DialogTitle>
            <DialogDescription>
              {state.kind === "routine"
                ? "Something you do regularly, like taking vitamins or exercising. Tick it off each day — no need to re-create it."
                : creating
                  ? "Something you need to get done once."
                  : "Update the details and save."}
            </DialogDescription>
          </DialogHeader>
          {creating && state.open ? (
            <ToggleGroup
              type="single"
              variant="outline"
              value={state.kind}
              onValueChange={(value) =>
                value && setState((prev) => ({ ...prev, kind: value as TaskKind, key: prev.key + 1 }))
              }
              aria-label="What are you adding?"
              className="w-full"
            >
              <ToggleGroupItem value="task" className="flex-1">
                One-time task
              </ToggleGroupItem>
              <ToggleGroupItem value="routine" className="flex-1">
                <Repeat aria-hidden="true" /> Routine
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          {state.open ? (
            state.kind === "routine" ? (
              <RoutineForm
                key={state.key}
                routine={isRoutine(state.item) ? state.item : null}
                today={today}
                categories={categories}
                onDone={close}
                onCancel={close}
              />
            ) : (
              <TaskForm
                key={state.key}
                task={isRoutine(state.item) ? null : state.item}
                defaults={state.defaults}
                categories={categories}
                onDone={close}
                onCancel={close}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </TaskEditorContext.Provider>
  );
}

export function NewTaskButton({
  defaults,
  label = "New task",
  variant = "default",
  size = "default",
  kind = "task",
}: {
  defaults?: Partial<TaskFormValues>;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  kind?: TaskKind;
}) {
  const { openCreate } = useTaskEditor();
  return (
    <Button variant={variant} size={size} onClick={() => openCreate({ ...defaults, kind })}>
      {kind === "routine" ? <Repeat aria-hidden="true" /> : <Plus aria-hidden="true" />}
      {label}
    </Button>
  );
}
