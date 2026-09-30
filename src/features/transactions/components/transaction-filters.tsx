"use client";

import { useState } from "react";

import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { useQueryParams } from "@/hooks/use-query-params";
import { isValidISODate } from "@/lib/dates";

import { RANGE_LABELS, RANGE_PRESETS, type RangePreset } from "../constants";
import type { DateRange, TransactionFilters as Filters } from "../schemas";

/** One filter row that scopes the totals, charts and history below it. */
export function TransactionFilters({
  range,
  filters,
  categories,
}: {
  range: DateRange;
  filters: Filters;
  categories: string[];
}) {
  const { update, pending } = useQueryParams();
  const [custom, setCustom] = useState({ from: range.from, to: range.to });
  const [showCustom, setShowCustom] = useState(range.preset === "custom");

  const choosePreset = (preset: RangePreset) => {
    if (preset === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    update({ range: preset === "this_month" ? "" : preset, from: "", to: "" });
  };

  const applyCustom = () => {
    if (isValidISODate(custom.from) && isValidISODate(custom.to)) {
      update({ range: "custom", from: custom.from, to: custom.to });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <NativeSelect
          aria-label="Date range"
          value={showCustom ? "custom" : range.preset}
          onChange={(event) => choosePreset(event.target.value as RangePreset)}
          className="w-full lg:w-44"
        >
          {RANGE_PRESETS.map((preset) => (
            <NativeSelectOption key={preset} value={preset}>
              {RANGE_LABELS[preset]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {showCustom ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              From
              <Input
                type="date"
                value={custom.from}
                onChange={(event) => setCustom((prev) => ({ ...prev, from: event.target.value }))}
                className="w-40"
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              To
              <Input
                type="date"
                value={custom.to}
                onChange={(event) => setCustom((prev) => ({ ...prev, to: event.target.value }))}
                className="w-40"
              />
            </label>
            <Button variant="outline" onClick={applyCustom} disabled={!isValidISODate(custom.from) || !isValidISODate(custom.to)}>
              Apply
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelect
            aria-label="Filter by type"
            value={filters.type ?? ""}
            onChange={(event) => update({ type: event.target.value })}
            className="w-full sm:w-36"
          >
            <NativeSelectOption value="">All types</NativeSelectOption>
            <NativeSelectOption value="expense">Expenses</NativeSelectOption>
            <NativeSelectOption value="income">Income</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by category"
            value={filters.category ?? ""}
            onChange={(event) => update({ category: event.target.value })}
            className="w-full sm:w-44"
          >
            <NativeSelectOption value="">All categories</NativeSelectOption>
            {categories.map((category) => (
              <NativeSelectOption key={category} value={category}>
                {category}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <SearchInput
          value={filters.q}
          onSearch={(q) => update({ q })}
          placeholder="Search transactions"
          label="Search transactions"
          className="lg:w-64"
        />
        {pending ? <Spinner className="text-muted-foreground" aria-label="Updating" /> : null}
      </div>
    </div>
  );
}
