"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export function MobileNav({
  name,
  email,
  initials,
}: {
  name: string;
  email: string | null;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="lg:hidden">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[18rem] gap-0 bg-sidebar p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Move between LifeHub sections</SheetDescription>
        <div className="flex h-full flex-col gap-6">
          <Logo href="/dashboard" className="px-1 pt-1" />
          <UserMenu name={name} email={email} initials={initials} />
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
