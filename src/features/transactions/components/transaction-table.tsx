"use client";

import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Pencil, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import { formatISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { deleteTransaction } from "../actions";
import { PAYMENT_METHOD_LABELS } from "../constants";
import type { TransactionItem } from "../queries";
import { useTransactionEditor } from "./transaction-editor";

export function TransactionTypeIcon({ type, className }: { type: TransactionItem["type"]; className?: string }) {
  const Icon = type === "income" ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        type === "income" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{type === "income" ? "Income" : "Expense"}</span>
    </span>
  );
}

/** Marks expenses that were recorded by paying a bill. */
export function BillPaymentBadge() {
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <Receipt className="size-3" aria-hidden="true" /> Bill
    </Badge>
  );
}

function RowActions({ transaction }: { transaction: TransactionItem }) {
  const { openEdit } = useTransactionEditor();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isBillPayment = Boolean(transaction.bill_occurrence_id);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${transaction.description}`} className="text-muted-foreground">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => openEdit(transaction)}>
            <Pencil aria-hidden="true" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isBillPayment ? (
            <DropdownMenuItem asChild>
              <Link href="/bills?view=paid">
                <Receipt aria-hidden="true" /> Manage in Bills
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
              <Trash2 aria-hidden="true" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this transaction?"
        description={`"${transaction.description}" (${formatMoney(transaction.amount_minor, transaction.currency)}) will be permanently deleted.`}
        onConfirm={async () => {
          const result = await deleteTransaction(transaction.id);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.message ?? "Deleted");
        }}
      />
    </>
  );
}

export function TransactionTable({ transactions }: { transactions: TransactionItem[] }) {
  const { openEdit } = useTransactionEditor();

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Desktop table */}
      <table className="hidden w-full table-fixed text-sm md:table">
        <caption className="sr-only">Transactions</caption>
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-32 px-5 py-2.5 font-medium">Date</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Description</th>
            <th scope="col" className="w-36 px-3 py-2.5 font-medium">Category</th>
            <th scope="col" className="hidden w-32 px-3 py-2.5 font-medium lg:table-cell">Method</th>
            <th scope="col" className="w-36 px-3 py-2.5 text-right font-medium">Amount</th>
            <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-muted/30">
              <td className="tabular px-5 py-3 whitespace-nowrap text-muted-foreground">
                <time dateTime={tx.occurred_on}>{formatISODate(tx.occurred_on, "medium")}</time>
              </td>
              <td className="max-w-0 px-3 py-3">
                <button
                  type="button"
                  onClick={() => openEdit(tx)}
                  className="flex max-w-full items-center gap-2.5 rounded-sm text-left font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <TransactionTypeIcon type={tx.type} className="size-7" />
                  <span className="truncate">{tx.description}</span>
                  {tx.bill_occurrence_id ? <BillPaymentBadge /> : null}
                </button>
              </td>
              <td className="truncate px-3 py-3 text-muted-foreground" title={tx.category}>{tx.category}</td>
              <td className="hidden truncate px-3 py-3 text-muted-foreground lg:table-cell">{PAYMENT_METHOD_LABELS[tx.payment_method]}</td>
              <td className="px-3 py-3 text-right font-semibold">
                <Money minor={tx.amount_minor} currency={tx.currency} signed tone={tx.type} />
              </td>
              <td className="px-3 py-3 text-right">
                <RowActions transaction={tx} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile list */}
      <ul role="list" className="divide-y md:hidden">
        {transactions.map((tx) => (
          <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
            <TransactionTypeIcon type={tx.type} />
            <button type="button" onClick={() => openEdit(tx)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{tx.description}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatISODate(tx.occurred_on, "short")} · {tx.category}
                {tx.bill_occurrence_id ? " · Bill payment" : ` · ${PAYMENT_METHOD_LABELS[tx.payment_method]}`}
              </span>
            </button>
            <Money minor={tx.amount_minor} currency={tx.currency} signed tone={tx.type} className="text-sm font-semibold" />
            <RowActions transaction={tx} />
          </li>
        ))}
      </ul>
    </div>
  );
}
