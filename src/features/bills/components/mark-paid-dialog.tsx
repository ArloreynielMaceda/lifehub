"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert, SubmitButton } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/features/transactions/constants";
import { formatISODate } from "@/lib/dates";
import { currencySymbol, formatMoney, minorToInputValue, parseMoneyToMinor } from "@/lib/money";

import { markBillPaid, undoBillPaid, type MarkPaidResult } from "../actions";
import type { BillItem } from "../queries";

/** Success toast (with Undo) shared by every way of marking a bill paid, done or skipped. */
export function announceBillResult(bill: Pick<BillItem, "id" | "title" | "kind">, result: MarkPaidResult, skipped = false) {
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  if (result.data.outcome === "unchanged") {
    toast.info("This was already recorded. Refreshing…");
    return;
  }
  const { dueDate, nextDueDate, expenseMinor } = result.data;
  const verb = skipped ? "skipped" : bill.kind === "bill" ? "paid" : "done";
  const parts = [`${bill.title} ${verb}`];
  if (!skipped && expenseMinor !== null && bill.kind === "bill") parts.push("added to expenses");
  if (result.data.outcome === "advanced" && nextDueDate) parts.push(`next on ${formatISODate(nextDueDate, "short")}`);
  toast.success(parts.join(" · "), {
    action: {
      label: "Undo",
      onClick: async () => {
        const undo = await undoBillPaid(bill.id, dueDate, nextDueDate);
        if (undo.ok) toast.success("Undone");
        else toast.error(undo.error);
      },
    },
  });
}

export function MarkPaidDialog({
  bill,
  today,
  open,
  onOpenChange,
}: {
  bill: BillItem;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [amount, setAmount] = useState(minorToInputValue(bill.amount_minor, bill.currency));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [recordExpense, setRecordExpense] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();

  const parsedAmount = amount.trim() ? parseMoneyToMinor(amount, bill.currency) : null;
  const willRecord = recordExpense && parsedAmount?.ok === true;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (parsedAmount && !parsedAmount.ok) {
      setFieldErrors({ amount: parsedAmount.error });
      return;
    }
    if (paidOn > today) {
      setFieldErrors({ paidOn: "Choose today or an earlier date" });
      return;
    }
    startTransition(async () => {
      const result = await markBillPaid(bill.id, bill.next_due_date, {
        amount: amount.trim() || undefined,
        paidOn,
        paymentMethod: method,
        recordExpense,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        return;
      }
      onOpenChange(false);
      announceBillResult(bill, result);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            {bill.title} · due {formatISODate(bill.next_due_date, "medium")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-5">
          <FormAlert message={error} />
          <FieldGroup className="gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!fieldErrors.amount}>
                <FieldLabel htmlFor={id("amount")}>Amount paid</FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                    {currencySymbol(bill.currency)}
                  </span>
                  <Input
                    id={id("amount")}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className="tabular pl-8"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-invalid={!!fieldErrors.amount}
                  />
                </div>
                <FieldError>{fieldErrors.amount}</FieldError>
              </Field>
              <Field data-invalid={!!fieldErrors.paidOn}>
                <FieldLabel htmlFor={id("paid-on")}>Paid on</FieldLabel>
                <Input
                  id={id("paid-on")}
                  type="date"
                  max={today}
                  value={paidOn}
                  onChange={(event) => setPaidOn(event.target.value)}
                  aria-invalid={!!fieldErrors.paidOn}
                />
                <FieldError>{fieldErrors.paidOn}</FieldError>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={id("method")}>Paid with</FieldLabel>
              <NativeSelect
                id={id("method")}
                className="w-full"
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {PAYMENT_METHOD_LABELS[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field orientation="horizontal" className="items-start rounded-lg border p-3">
              <Checkbox
                id={id("record")}
                checked={recordExpense}
                onCheckedChange={(checked) => setRecordExpense(checked === true)}
                className="mt-0.5"
              />
              <FieldContent>
                <FieldLabel htmlFor={id("record")}>Add to expenses</FieldLabel>
                <FieldDescription>
                  {willRecord && parsedAmount?.ok
                    ? `${formatMoney(parsedAmount.minor, bill.currency)} will count as spent on ${formatISODate(paidOn, "short")}. Untick if you already logged this payment.`
                    : recordExpense
                      ? "Enter the amount to count it in your spending."
                      : "The bill is marked paid, but your spending won't change."}
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingLabel="Saving…">
              Mark as paid
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
