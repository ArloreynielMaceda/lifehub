"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert, SubmitButton } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { applyServerErrors } from "@/lib/forms";

import { createTask, updateTask } from "../actions";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  SUGGESTED_TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../constants";
import type { TaskItem } from "../queries";
import { taskFormSchema, type TaskFormValues } from "../schemas";

export function TaskForm({
  task,
  defaults,
  categories,
  onDone,
  onCancel,
}: {
  task?: TaskItem | null;
  defaults?: Partial<TaskFormValues>;
  categories: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title ?? defaults?.title ?? "",
      description: task?.description ?? defaults?.description ?? "",
      dueDate: task?.due_date ?? defaults?.dueDate ?? "",
      priority: task?.priority ?? defaults?.priority ?? "medium",
      status: task?.status ?? defaults?.status ?? "pending",
      category: task?.category ?? defaults?.category ?? "",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = task ? await updateTask(task.id, values) : await createTask(values);
      if (!result.ok) {
        applyServerErrors(form.setError, result.fieldErrors);
        setServerError(result.error);
        return;
      }
      toast.success(result.message ?? "Saved");
      onDone();
    });
  });

  const { errors } = form.formState;
  const suggestions = [...new Set([...categories, ...SUGGESTED_TASK_CATEGORIES])];
  const fieldId = (name: string) => `${uid}-${name}`;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor={fieldId("title")}>Title</FieldLabel>
          <Input
            id={fieldId("title")}
            autoFocus
            placeholder="e.g. Submit scholarship form"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? fieldId("title-error") : undefined}
            {...form.register("title")}
          />
          <FieldError id={fieldId("title-error")} errors={[errors.title]} />
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor={fieldId("description")}>
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id={fieldId("description")}
            rows={3}
            aria-invalid={!!errors.description}
            {...form.register("description")}
          />
          <FieldError errors={[errors.description]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.dueDate}>
            <FieldLabel htmlFor={fieldId("due")}>Due date</FieldLabel>
            <Input id={fieldId("due")} type="date" aria-invalid={!!errors.dueDate} {...form.register("dueDate")} />
            <FieldError errors={[errors.dueDate]} />
          </Field>
          <Field data-invalid={!!errors.category}>
            <FieldLabel htmlFor={fieldId("category")}>Category</FieldLabel>
            <Input
              id={fieldId("category")}
              list={fieldId("categories")}
              placeholder="e.g. Home"
              autoComplete="off"
              aria-invalid={!!errors.category}
              {...form.register("category")}
            />
            <datalist id={fieldId("categories")}>
              {suggestions.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <FieldError errors={[errors.category]} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel id={fieldId("priority-label")}>Priority</FieldLabel>
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-labelledby={fieldId("priority-label")}
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value)}
                  className="w-full"
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <ToggleGroupItem key={priority} value={priority} className="flex-1">
                      {PRIORITY_LABELS[priority]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={fieldId("status")}>Status</FieldLabel>
            <NativeSelect id={fieldId("status")} className="w-full" {...form.register("status")}>
              {TASK_STATUSES.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {STATUS_LABELS[status]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {task ? "Save changes" : "Add task"}
        </SubmitButton>
      </div>
    </form>
  );
}
