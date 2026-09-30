"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert, SubmitButton } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addDays, formatISODate, isValidISODate } from "@/lib/dates";
import { applyServerErrors } from "@/lib/forms";
import {
  ISO_WEEKDAYS,
  ROUTINE_PRESETS,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  describeRepeatDays,
  presetFor,
  scheduledDatesBetween,
  type RoutinePreset,
} from "@/lib/routines";

import { createRoutine, updateRoutine } from "../actions";
import { PRIORITY_LABELS, ROUTINE_PRESET_LABELS, SUGGESTED_TASK_CATEGORIES, TASK_PRIORITIES } from "../constants";
import type { RoutineItem } from "../queries";
import { routineFormSchema } from "../schemas";

export function RoutineForm({
  routine,
  today,
  categories,
  onDone,
  onCancel,
}: {
  routine?: RoutineItem | null;
  today: string;
  categories: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const initialDays = routine?.repeat_days ?? [...ROUTINE_PRESETS.daily];
  const [preset, setPreset] = useState<RoutinePreset>(presetFor(initialDays));

  const form = useForm({
    resolver: zodResolver(routineFormSchema),
    defaultValues: {
      title: routine?.title ?? "",
      description: routine?.description ?? "",
      priority: routine?.priority ?? "medium",
      category: routine?.category ?? "",
      repeatDays: initialDays,
      startsOn: routine?.starts_on ?? today,
      endsOn: routine?.ends_on ?? "",
      reminderTime: routine?.reminder_time?.slice(0, 5) ?? "",
    },
  });

  const [repeatDays, startsOn, endsOn] = useWatch({ control: form.control, name: ["repeatDays", "startsOn", "endsOn"] });
  const preview =
    repeatDays.length > 0 && isValidISODate(startsOn)
      ? scheduledDatesBetween(
          { repeat_days: repeatDays, starts_on: startsOn, ends_on: isValidISODate(endsOn) ? endsOn : null, paused_on: null },
          startsOn > today ? startsOn : today,
          addDays(startsOn > today ? startsOn : today, 13),
          3,
        )
      : [];

  const choosePreset = (next: RoutinePreset) => {
    setPreset(next);
    if (next !== "custom") form.setValue("repeatDays", [...ROUTINE_PRESETS[next]], { shouldDirty: true, shouldValidate: true });
  };

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = routine ? await updateRoutine(routine.id, values) : await createRoutine(values);
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

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor={id("title")}>Routine</FieldLabel>
          <Input
            id={id("title")}
            autoFocus
            placeholder="e.g. Take vitamins"
            aria-invalid={!!errors.title}
            {...form.register("title")}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <Field data-invalid={!!errors.repeatDays}>
          <FieldLabel htmlFor={id("preset")}>Repeats</FieldLabel>
          <NativeSelect
            id={id("preset")}
            className="w-full"
            value={preset}
            onChange={(event) => choosePreset(event.target.value as RoutinePreset)}
          >
            {(Object.keys(ROUTINE_PRESET_LABELS) as RoutinePreset[]).map((key) => (
              <NativeSelectOption key={key} value={key}>
                {ROUTINE_PRESET_LABELS[key]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {preset === "custom" ? (
            <Controller
              control={form.control}
              name="repeatDays"
              render={({ field }) => (
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  aria-label="Days of the week"
                  value={field.value.map(String)}
                  onValueChange={(values) => field.onChange(values.map(Number).sort((a, b) => a - b))}
                  className="w-full"
                >
                  {ISO_WEEKDAYS.map((day) => (
                    <ToggleGroupItem key={day} value={String(day)} aria-label={WEEKDAY_LONG[day]} className="flex-1 px-0">
                      {WEEKDAY_SHORT[day]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          ) : null}
          {errors.repeatDays ? (
            <FieldError errors={[errors.repeatDays]} />
          ) : (
            <FieldDescription>
              {repeatDays.length ? describeRepeatDays(repeatDays) : "No days chosen"}
              {preview.length ? ` · next: ${preview.map((date) => formatISODate(date, "short")).join(", ")}` : ""}
            </FieldDescription>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.startsOn}>
            <FieldLabel htmlFor={id("starts")}>Starts</FieldLabel>
            <Input id={id("starts")} type="date" aria-invalid={!!errors.startsOn} {...form.register("startsOn")} />
            <FieldError errors={[errors.startsOn]} />
          </Field>
          <Field data-invalid={!!errors.endsOn}>
            <FieldLabel htmlFor={id("ends")}>
              Ends <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id={id("ends")} type="date" aria-invalid={!!errors.endsOn} {...form.register("endsOn")} />
            <FieldError errors={[errors.endsOn]} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.reminderTime}>
            <FieldLabel htmlFor={id("reminder")}>
              Reminder <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id={id("reminder")} type="time" aria-invalid={!!errors.reminderTime} aria-describedby={id("reminder-help")} {...form.register("reminderTime")} />
            {errors.reminderTime ? (
              <FieldError errors={[errors.reminderTime]} />
            ) : (
              <FieldDescription id={id("reminder-help")}>Shows in your notifications after this time.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!errors.category}>
            <FieldLabel htmlFor={id("category")}>Category</FieldLabel>
            <Input
              id={id("category")}
              list={id("categories")}
              placeholder="e.g. Health"
              autoComplete="off"
              aria-invalid={!!errors.category}
              {...form.register("category")}
            />
            <datalist id={id("categories")}>
              {suggestions.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <FieldError errors={[errors.category]} />
          </Field>
        </div>

        <Field>
          <FieldLabel id={id("priority-label")}>Priority</FieldLabel>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby={id("priority-label")}
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

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor={id("description")}>
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea id={id("description")} rows={2} aria-invalid={!!errors.description} {...form.register("description")} />
          <FieldError errors={[errors.description]} />
        </Field>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {routine ? "Save changes" : "Add routine"}
        </SubmitButton>
      </div>
    </form>
  );
}
