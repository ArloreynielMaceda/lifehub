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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { applyServerErrors } from "@/lib/forms";
import { currencySymbol, minorToInputValue } from "@/lib/money";

import { createTransaction, updateTransaction } from "../actions";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TYPE_LABELS,
} from "../constants";
import type { TransactionItem } from "../queries";
import { transactionFormSchema } from "../schemas";

export function TransactionForm({
  transaction,
  currency,
  today,
  usedCategories,
  onDone,
  onCancel,
}: {
  transaction?: TransactionItem | null;
  currency: string;
  today: string;
  usedCategories: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const txCurrency = transaction?.currency ?? currency;
  const isBillPayment = Boolean(transaction?.bill_occurrence_id);
  const schema = useMemo(() => transactionFormSchema(txCurrency), [txCurrency]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      type: transaction?.type ?? "expense",
      amount: minorToInputValue(transaction?.amount_minor, txCurrency),
      description: transaction?.description ?? "",
      category: transaction?.category ?? "",
      paymentMethod: transaction?.payment_method ?? "cash",
      occurredOn: transaction?.occurred_on ?? today,
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const suggestions = [
    ...new Set([...(type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES), ...usedCategories]),
  ];

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = transaction ? await updateTransaction(transaction.id, values) : await createTransaction(values);
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
          <FieldLabel id={id("type-label")}>Type</FieldLabel>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby={id("type-label")}
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
                disabled={isBillPayment}
                className="w-full"
              >
                {(["expense", "income"] as const).map((value) => (
                  <ToggleGroupItem key={value} value={value} className="flex-1">
                    {TYPE_LABELS[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
        </Field>

        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor={id("amount")}>Amount</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-base text-muted-foreground">
              {currencySymbol(txCurrency)}
            </span>
            <Input
              id={id("amount")}
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="tabular h-12 pl-9 text-lg font-semibold read-only:bg-muted/50 md:text-lg"
              readOnly={isBillPayment}
              aria-invalid={!!errors.amount}
              aria-describedby={id("amount-help")}
              {...form.register("amount")}
            />
          </div>
          {errors.amount ? (
            <FieldError id={id("amount-help")} errors={[errors.amount]} />
          ) : isBillPayment ? (
            <FieldDescription id={id("amount-help")}>
              Recorded when you paid a bill. To change the amount, undo the payment in Bills and mark it paid again.
            </FieldDescription>
          ) : transaction && transaction.currency !== currency ? (
            <FieldDescription id={id("amount-help")}>
              Recorded in {transaction.currency}; historical amounts keep their original currency.
            </FieldDescription>
          ) : null}
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor={id("description")}>Description</FieldLabel>
          <Input
            id={id("description")}
            placeholder={type === "income" ? "e.g. September salary" : "e.g. Weekly groceries"}
            aria-invalid={!!errors.description}
            {...form.register("description")}
          />
          <FieldError errors={[errors.description]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.category}>
            <FieldLabel htmlFor={id("category")}>Category</FieldLabel>
            <Input
              id={id("category")}
              list={id("categories")}
              autoComplete="off"
              placeholder={type === "income" ? "e.g. Salary" : "e.g. Groceries"}
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
          <Field data-invalid={!!errors.occurredOn}>
            <FieldLabel htmlFor={id("date")}>Date</FieldLabel>
            <Input id={id("date")} type="date" aria-invalid={!!errors.occurredOn} {...form.register("occurredOn")} />
            <FieldError errors={[errors.occurredOn]} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor={id("method")}>Payment method</FieldLabel>
          <NativeSelect id={id("method")} className="w-full" {...form.register("paymentMethod")}>
            {PAYMENT_METHODS.map((method) => (
              <NativeSelectOption key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {transaction ? "Save changes" : type === "income" ? "Add income" : "Add expense"}
        </SubmitButton>
      </div>
    </form>
  );
}
