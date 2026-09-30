"use client";

import { CalendarClock, FileUp, ListChecks, NotebookPen, Plus, Repeat, Wallet } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const QUICK_ADD_ITEMS = [
  { href: "/tasks?new=1", label: "New task", icon: ListChecks },
  { href: "/tasks?new=routine", label: "New routine", icon: Repeat },
  { href: "/bills?new=bill", label: "New bill", icon: CalendarClock },
  { href: "/bills?new=reminder", label: "New reminder", icon: CalendarClock },
  { href: "/expenses?new=1", label: "Log a transaction", icon: Wallet },
  { href: "/notes/new", label: "New note", icon: NotebookPen },
  { href: "/documents?upload=1", label: "Upload document", icon: FileUp },
] as const;

export function QuickAddMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus aria-hidden="true" />
          <span>New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {QUICK_ADD_ITEMS.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icon aria-hidden="true" /> {label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
