"use client";

import { FilterTabs } from "@/components/shared/filter-tabs";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useQueryParams } from "@/hooks/use-query-params";

import { BILL_VIEWS, VIEW_LABELS, type BillView } from "../constants";
import type { BillFilters } from "../schemas";

export function BillToolbar({ filters, counts }: { filters: BillFilters; counts: Partial<Record<BillView, number>> }) {
  const { update } = useQueryParams();
  return (
    <div className="space-y-4">
      <FilterTabs
        param="view"
        label="Bill views"
        value={filters.view}
        defaultValue="upcoming"
        options={BILL_VIEWS.map((view) => ({ value: view, label: VIEW_LABELS[view] }))}
        counts={counts}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={filters.q}
          onSearch={(q) => update({ q })}
          placeholder="Search bills and reminders"
          label="Search bills and reminders"
          className="sm:w-72"
        />
        <NativeSelect
          aria-label="Filter by type"
          value={filters.kind ?? ""}
          onChange={(event) => update({ kind: event.target.value })}
          className="w-full sm:w-44"
        >
          <NativeSelectOption value="">Bills and reminders</NativeSelectOption>
          <NativeSelectOption value="bill">Bills only</NativeSelectOption>
          <NativeSelectOption value="reminder">Reminders only</NativeSelectOption>
        </NativeSelect>
      </div>
    </div>
  );
}
