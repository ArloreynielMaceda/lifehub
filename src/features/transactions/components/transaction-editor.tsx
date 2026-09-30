"use client";

import { Plus } from "lucide-react";
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

import type { TransactionItem } from "../queries";
import { TransactionForm } from "./transaction-form";

interface TransactionEditorApi {
  openCreate: () => void;
  openEdit: (transaction: TransactionItem) => void;
}

const TransactionEditorContext = createContext<TransactionEditorApi | null>(null);

export function useTransactionEditor(): TransactionEditorApi {
  const api = useContext(TransactionEditorContext);
  if (!api) throw new Error("useTransactionEditor must be used inside <TransactionEditorProvider>");
  return api;
}

export function TransactionEditorProvider({
  currency,
  today,
  usedCategories,
  children,
}: {
  currency: string;
  today: string;
  usedCategories: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<{ open: boolean; transaction: TransactionItem | null; key: number }>({
    open: false,
    transaction: null,
    key: 0,
  });

  const openCreate = useCallback(() => setState((prev) => ({ open: true, transaction: null, key: prev.key + 1 })), []);
  const openEdit = useCallback(
    (transaction: TransactionItem) => setState((prev) => ({ open: true, transaction, key: prev.key + 1 })),
    [],
  );

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const timer = window.setTimeout(() => {
      openCreate();
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openCreate, pathname, router, searchParams]);

  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);
  const close = () => setState((prev) => ({ ...prev, open: false }));

  return (
    <TransactionEditorContext.Provider value={api}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{state.transaction ? "Edit transaction" : "Log a transaction"}</DialogTitle>
            <DialogDescription>Record money in or out. Amounts are stored exactly, to the centavo.</DialogDescription>
          </DialogHeader>
          {state.open ? (
            <TransactionForm
              key={state.key}
              transaction={state.transaction}
              currency={currency}
              today={today}
              usedCategories={usedCategories}
              onDone={close}
              onCancel={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </TransactionEditorContext.Provider>
  );
}

export function NewTransactionButton({
  label = "Add transaction",
  variant = "default",
}: {
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const { openCreate } = useTransactionEditor();
  return (
    <Button variant={variant} onClick={openCreate}>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  );
}
