"use client";

import { SearchInput } from "@/components/shared/search-input";
import { useQueryParams } from "@/hooks/use-query-params";

export function NotesSearch({ value }: { value: string }) {
  const { update } = useQueryParams();
  return (
    <SearchInput
      value={value}
      onSearch={(q) => update({ q })}
      placeholder="Search notes"
      label="Search notes"
      className="sm:w-72"
    />
  );
}
