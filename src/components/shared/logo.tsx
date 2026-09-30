import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9 16.5l4.2 4.2L23 10.9"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="21.5" r="2" fill="white" opacity="0.85" />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  label = "LifeHub home",
}: {
  href?: string;
  className?: string;
  label?: string;
}) {
  return (
    <Link href={href} aria-label={label} className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-[1.45rem] leading-none text-foreground">LifeHub</span>
    </Link>
  );
}
