"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert, SubmitButton } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatISODate, isValidISODate } from "@/lib/dates";
import { applyServerErrors } from "@/lib/forms";
import { currencySymbol, minorToInputValue } from "@/lib/money";
import { RECURRENCES, RECURRENCE_LABELS, occurrencesBetween, type Recurrence } from "@/lib/recurrence";

import { createBill, updateBill } from "../actions";
import { KIND_LABELS, SUGGESTED_BILL_CATEGORIES, type BillKind } from "../constants";
import type { BillItem } from "../queries";
import { billFormSchema } from "../schemas";

export function BillForm({
  bill,
  defaultKind = "bill",
  currency,
  today,
  onDone,
  onCancel,
}: {
  bill?: BillItem | null;
  defaultKind?: BillKind;
  currency: string;
  today: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const amountCurrency = bill?.currency ?? currency;
  const schema = useMemo(() => billFormSchema(amountCurrency), [amountCurrency]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: bill?.kind ?? defaultKind,
      title: bill?.title ?? "",
      description: bill?.description ?? "",
      category: bill?.category ?? "",
      amount: minorToInputValue(bill?.amount_minor, amountCurrency),
      dueDate: bill?.next_due_date ?? today,
      recurrence: (bill?.recurrence ?? "monthly") as Recurrence,
    },
  });

  const [kind, dueDate, recurrence] = useWatch({ control: form.control, name: ["kind", "dueDate", "recurrence"] });
  const preview =
    recurrence !== "none" && isValidISODate(dueDate)
      ? occurrencesBetween(dueDate, recurrence, dueDate, "2999-12-31", 3)
      : [];

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = bill ? await updateBill(bill.id, values) : await createBill(values);
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

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel id={id("kind-label")}>Type</FieldLabel>
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby={id("kind-label")}
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
                className="w-full"
              >
                {(["bill", "reminder"] as const).map((value) => (
                  <ToggleGroupItem key={value} value={value} className="flex-1">
                    {KIND_LABELS[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
        </Field>

        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor={id("title")}>Name</FieldLabel>
          <Input
            id={id("title")}
            autoFocus
            placeholder={kind === "bill" ? "e.g. Electricity" : "e.g. Renew driver's license"}
            aria-invalid={!!errors.title}
            {...form.register("title")}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.amount}>
            <FieldLabel htmlFor={id("amount")}>
              Amount <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                {currencySymbol(amountCurrency)}
              </span>
              <Input
                id={id("amount")}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className="tabular pl-8"
                aria-invalid={!!errors.amount}
                {...form.register("amount")}
              />
            </div>
            <FieldError errors={[errors.amount]} />
          </Field>
          <Field data-invalid={!!errors.category}>
            <FieldLabel htmlFor={id("category")}>Category</FieldLabel>
            <Input
              id={id("category")}
              list={id("categories")}
              autoComplete="off"
              placeholder="e.g. Utilities"
              aria-invalid={!!errors.category}
              {...form.register("category")}
            />
            <datalist id={id("categories")}>
              {SUGGESTED_BILL_CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <FieldError errors={[errors.category]} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.dueDate}>
            <FieldLabel htmlFor={id("due")}>{bill ? "Next due date" : "Due date"}</FieldLabel>
            <Input id={id("due")} type="date" aria-invalid={!!errors.dueDate} {...form.register("dueDate")} />
            <FieldError errors={[errors.dueDate]} />
          </Field>
          <Field>
            <FieldLabel htmlFor={id("recurrence")}>Repeats</FieldLabel>
            <NativeSelect id={id("recurrence")} className="w-full" {...form.register("recurrence")}>
              {RECURRENCES.map((rule) => (
                <NativeSelectOption key={rule} value={rule}>
                  {RECURRENCE_LABELS[rule]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {preview.length > 1 ? (
          <FieldDescription className="-mt-2">
            Next dates: {preview.map((date) => formatISODate(date, "short")).join(" · ")}
            {Number(dueDate.slice(8)) > 28 && recurrence === "monthly"
              ? " — shorter months use their last day."
              : ""}
          </FieldDescription>
        ) : null}

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
          {bill ? "Save changes" : kind === "bill" ? "Add bill" : "Add reminder"}
        </SubmitButton>
      </div>
    </form>
  );
}
