import { CalendarCheck2, FileLock2, Wallet } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/shared/logo";

const POINTS = [
  { icon: CalendarCheck2, title: "Tasks and reminders", text: "Know what's due today and what's coming next." },
  { icon: Wallet, title: "Bills and spending", text: "Track what's paid, what's due and where money goes." },
  { icon: FileLock2, title: "A private vault", text: "Your IDs and receipts, visible only to you." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} LifeHub</span>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
        </footer>
      </div>
      <aside className="relative hidden overflow-hidden border-l bg-canvas lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md space-y-10">
          <p className="font-display text-[2.75rem] leading-[1.05] text-foreground">
            A calmer way to keep <em className="text-primary">everyday life</em> in order.
          </p>
          <ul className="space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
