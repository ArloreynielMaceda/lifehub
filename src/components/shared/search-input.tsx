"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Debounced search box. Calls `onSearch` 300 ms after typing stops. */
export function SearchInput({
  value,
  onSearch,
  placeholder = "Search",
  label = "Search",
  className,
}: {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(onSearch);

  useEffect(() => {
    latest.current = onSearch;
  }, [onSearch]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const schedule = (next: string) => {
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => latest.current(next.trim()), 300);
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={text}
        onChange={(event) => schedule(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            window.clearTimeout(timer.current);
            latest.current(text.trim());
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        maxLength={100}
      />
      {text ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
          aria-label="Clear search"
          onClick={() => {
            window.clearTimeout(timer.current);
            setText("");
            latest.current("");
          }}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
