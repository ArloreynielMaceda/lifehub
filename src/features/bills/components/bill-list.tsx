"use client";

import { BellRing, Check, MoreHorizontal, Pencil, Receipt, Repeat, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DueLabel } from "@/components/shared/due-label";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { formatISODate, type ISODate } from "@/lib/dates";
import { RECURRENCE_SHORT_LABELS, type Recurrence } from "@/lib/recurrence";
import { cn } from "@/lib/utils";

import { deleteBill, markBillPaid, skipBill, undoBillPaid } from "../actions";
import type { BillItem } from "../queries";
import { useBillEditor } from "./bill-editor";
import { MarkPaidDialog, announceBillResult } from "./mark-paid-dialog";

export function BillKindIcon({ kind, className }: { kind: BillItem["kind"]; className?: string }) {
  const Icon = kind === "bill" ? Receipt : BellRing;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        kind === "bill" ? "bg-accent text-accent-foreground" : "bg-info-soft text-info",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{kind === "bill" ? "Bill" : "Reminder"}</span>
    </span>
  );
}

/** Payment status in plain words: Upcoming · Due today · Overdue · Paid/Done · Cancelled. */
export function BillStatusBadge({ bill, today }: { bill: BillItem; today: ISODate }) {
  if (bill.status === "completed") {
    if (bill.last_outcome === "skipped") return <Badge variant="muted">Cancelled</Badge>;
    return <Badge variant="success">{bill.kind === "bill" ? "Paid" : "Done"}</Badge>;
  }
  if (bill.next_due_date < today) return <Badge variant="danger">Overdue</Badge>;
  if (bill.next_due_date === today) return <Badge variant="warning">Due today</Badge>;
  return <Badge variant="muted">{bill.kind === "bill" ? "Upcoming · unpaid" : "Upcoming"}</Badge>;
}

/** One-click paid/done with default details (dashboard and reminders). */
export function useQuickMarkPaid(bill: BillItem) {
  const [pending, startTransition] = useTransition();
  const markPaid = () =>
    startTransition(async () => {
      announceBillResult(bill, await markBillPaid(bill.id, bill.next_due_date));
    });
  return { markPaid, pending };
}

export function BillRow({ bill, today }: { bill: BillItem; today: ISODate }) {
  const { openEdit } = useBillEditor();
  const quick = useQuickMarkPaid(bill);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const completed = bill.status === "completed";
  const recurring = bill.recurrence !== "none";

  const skip = () =>
    startTransition(async () => {
      announceBillResult(bill, await skipBill(bill.id, bill.next_due_date), true);
    });
  const markUnpaid = () =>
    startTransition(async () => {
      const result = await undoBillPaid(bill.id, bill.next_due_date, null);
      if (result.ok) toast.success("Marked as unpaid");
      else toast.error(result.error);
    });

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <BillKindIcon kind={bill.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <button
              type="button"
              onClick={() => openEdit(bill)}
              className="truncate rounded-sm text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {bill.title}
            </button>
            {bill.amount_minor !== null ? (
              <Money minor={bill.amount_minor} currency={bill.currency} className="text-sm font-semibold sm:hidden" />
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <BillStatusBadge bill={bill} today={today} />
            {completed || bill.next_due_date === today ? null : bill.next_due_date < today ? (
              <span className="text-destructive">was due {formatISODate(bill.next_due_date, "short")}</span>
            ) : (
              <DueLabel date={bill.next_due_date} today={today} />
            )}
            {recurring ? (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3" aria-hidden="true" />
                {RECURRENCE_SHORT_LABELS[bill.recurrence as Recurrence]}
                {bill.following_due_date ? ` · then ${formatISODate(bill.following_due_date, "short")}` : ""}
              </span>
            ) : null}
            {bill.category ? <span>· {bill.category}</span> : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-12 sm:pl-0">
        {bill.amount_minor !== null ? (
          <Money
            minor={bill.amount_minor}
            currency={bill.currency}
            className="hidden w-28 text-right text-sm font-semibold sm:inline"
          />
        ) : (
          <span className="hidden w-28 sm:inline" />
        )}
        {!completed ? (
          bill.kind === "bill" ? (
            <Button variant="outline" size="sm" onClick={() => setPayOpen(true)} disabled={busy} className="min-w-[7.5rem]">
              <Check aria-hidden="true" /> Mark as paid
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={quick.markPaid} disabled={quick.pending || busy} className="min-w-[7.5rem]">
              {quick.pending ? <Spinner aria-hidden="true" /> : <Check aria-hidden="true" />}
              Mark done
            </Button>
          )
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${bill.title}`} className="ml-auto text-muted-foreground sm:ml-0">
              {busy ? <Spinner aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => openEdit(bill)}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
            {!completed ? (
              <DropdownMenuItem onSelect={skip}>
                <SkipForward aria-hidden="true" />
                {recurring ? "Skip this one" : bill.kind === "bill" ? "Cancel bill" : "Skip"}
              </DropdownMenuItem>
            ) : !recurring ? (
              <DropdownMenuItem onSelect={markUnpaid}>
                <RotateCcw aria-hidden="true" />
                {bill.kind === "bill" ? "Mark as unpaid" : "Mark as not done"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
              <Trash2 aria-hidden="true" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {bill.kind === "bill" && !completed ? (
        <MarkPaidDialog key={`${bill.id}:${bill.next_due_date}`} bill={bill} today={today} open={payOpen} onOpenChange={setPayOpen} />
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete this ${bill.kind}?`}
        description={
          bill.kind === "bill"
            ? `"${bill.title}" and its payment history will be deleted. Payments already added to Expenses stay there.`
            : `"${bill.title}" and its history will be permanently deleted.`
        }
        onConfirm={async () => {
          const result = await deleteBill(bill.id);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.message ?? "Deleted");
        }}
      />
    </li>
  );
}

export function BillList({ bills, today }: { bills: BillItem[]; today: ISODate }) {
  return (
    <ul role="list" className="divide-y overflow-hidden rounded-xl border bg-card">
      {bills.map((bill) => (
        <BillRow key={bill.id} bill={bill} today={today} />
      ))}
    </ul>
  );
}

/** Dense row for dashboard cards: one tap marks it paid (bill amount, today) with Undo. */
export function CompactBillRow({ bill, today }: { bill: BillItem; today: ISODate }) {
  const { markPaid, pending } = useQuickMarkPaid(bill);
  const label = bill.kind === "bill" ? `Mark ${bill.title} as paid` : `Mark ${bill.title} as done`;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <BillKindIcon kind={bill.kind} className="size-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{bill.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <DueLabel date={bill.next_due_date} today={today} />
          {bill.recurrence !== "none" ? <span>· {RECURRENCE_SHORT_LABELS[bill.recurrence as Recurrence]}</span> : null}
        </div>
      </div>
      {bill.amount_minor !== null ? (
        <Money minor={bill.amount_minor} currency={bill.currency} className="text-sm font-semibold" />
      ) : null}
      <Button variant="ghost" size="icon-sm" onClick={markPaid} disabled={pending} aria-label={label} title={label}>
        {pending ? <Spinner aria-hidden="true" /> : <Check aria-hidden="true" />}
      </Button>
    </li>
  );
}
