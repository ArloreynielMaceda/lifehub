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

import type { BillKind } from "../constants";
import type { BillItem } from "../queries";
import { BillForm } from "./bill-form";

interface BillEditorApi {
  openCreate: (kind?: BillKind) => void;
  openEdit: (bill: BillItem) => void;
}

const BillEditorContext = createContext<BillEditorApi | null>(null);

export function useBillEditor(): BillEditorApi {
  const api = useContext(BillEditorContext);
  if (!api) throw new Error("useBillEditor must be used inside <BillEditorProvider>");
  return api;
}

export function BillEditorProvider({
  currency,
  today,
  children,
}: {
  currency: string;
  today: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<{ open: boolean; bill: BillItem | null; kind: BillKind; key: number }>({
    open: false,
    bill: null,
    kind: "bill",
    key: 0,
  });

  const openCreate = useCallback((kind: BillKind = "bill") => {
    setState((prev) => ({ open: true, bill: null, kind, key: prev.key + 1 }));
  }, []);
  const openEdit = useCallback((bill: BillItem) => {
    setState((prev) => ({ open: true, bill, kind: bill.kind, key: prev.key + 1 }));
  }, []);

  useEffect(() => {
    const requested = searchParams.get("new");
    if (requested !== "bill" && requested !== "reminder") return;
    const timer = window.setTimeout(() => {
      openCreate(requested);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openCreate, pathname, router, searchParams]);

  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);
  const close = () => setState((prev) => ({ ...prev, open: false }));
  const noun = state.kind === "bill" ? "bill" : "reminder";

  return (
    <BillEditorContext.Provider value={api}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{state.bill ? `Edit ${noun}` : `New ${noun}`}</DialogTitle>
            <DialogDescription>
              {state.kind === "bill"
                ? "Track what you owe and when it's due. Recurring bills roll forward when paid."
                : "A dated reminder, one-time or repeating."}
            </DialogDescription>
          </DialogHeader>
          {state.open ? (
            <BillForm
              key={state.key}
              bill={state.bill}
              defaultKind={state.kind}
              currency={currency}
              today={today}
              onDone={close}
              onCancel={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </BillEditorContext.Provider>
  );
}

export function NewBillButton({
  kind = "bill",
  label,
  variant = "default",
}: {
  kind?: BillKind;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const { openCreate } = useBillEditor();
  return (
    <Button variant={variant} onClick={() => openCreate(kind)}>
      <Plus aria-hidden="true" />
      {label ?? (kind === "bill" ? "New bill" : "New reminder")}
    </Button>
  );
}
