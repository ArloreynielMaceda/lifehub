"use client";

import { SearchInput } from "@/components/shared/search-input";
import { useQueryParams } from "@/hooks/use-query-params";

export function DocumentSearch({ value }: { value: string }) {
  const { update } = useQueryParams();
  return (
    <SearchInput
      value={value}
      onSearch={(q) => update({ q })}
      placeholder="Search by file name"
      label="Search documents"
      className="sm:w-64"
    />
  );
}
