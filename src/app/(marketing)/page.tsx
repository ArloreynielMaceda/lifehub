import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  FolderLock,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  NotebookPen,
  Repeat,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CompanionFigure, type CompanionPose } from "@/components/companion/companion";
import { AccountDeletedNotice } from "@/components/marketing/account-deleted-notice";
import { Faq } from "@/components/marketing/faq";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Button } from "@/components/ui/button";
import { formatISODate, todayInTimeZone } from "@/lib/dates";
import { occurrenceAt } from "@/lib/recurrence";

// The preview shows "today"; regenerate the static page hourly.
export const revalidate = 3600;

const FEATURES = [
  {
    icon: ListChecks,
    title: "Tasks",
    text: "Due dates, priorities and categories, with list and calendar views. See what's due today and what slipped.",
  },
  {
    icon: CalendarClock,
    title: "Bills & reminders",
    text: "One-time or repeating — daily, weekly, monthly, yearly. Mark them paid and they roll forward on their own.",
  },
  {
    icon: Wallet,
    title: "Expenses",
    text: "Log income and spending in seconds. Monthly totals, category breakdowns and six-month trends, in pesos by default.",
  },
  {
    icon: NotebookPen,
    title: "Notes",
    text: "Lists, ideas and meeting notes that save as you type. Pin the important ones and search everything.",
  },
  {
    icon: FolderLock,
    title: "Document vault",
    text: "Keep IDs, receipts and certificates in a private vault. Preview or download through links that expire in a minute.",
  },
  {
    icon: BellRing,
    title: "Notifications",
    text: "An inbox for what's due soon, due today or overdue — so the important things find you.",
  },
];

const STEPS = [
  {
    title: "Create your account",
    text: "Sign up with your email and confirm it. It takes under a minute, and there's no card to enter.",
  },
  {
    title: "Add what's on your plate",
    text: "Drop in this week's tasks, your regular bills, a few notes and the documents you're always hunting for.",
  },
  {
    title: "Check in once a day",
    text: "Your dashboard shows what's due, what you've spent this month and what's coming next. That's it.",
  },
];

const DAY_POSES: { pose: CompanionPose; label: string; text: string; phase: string }[] = [
  { pose: "goodmorning", label: "Good morning", text: "A wave and today's plan.", phase: "[animation-delay:0s]" },
  { pose: "goodafternoon", label: "Good afternoon", text: "What's left, at a glance.", phase: "[animation-delay:-1.8s]" },
  { pose: "goodevening", label: "Good evening", text: "A calm wrap-up.", phase: "[animation-delay:-3.6s]" },
  { pose: "night", label: "Good night", text: "Time to rest.", phase: "[animation-delay:-5.4s]" },
];

const COMPANION_POINTS = [
  "Greets you by the time of day",
  "Celebrates the routines and tasks you finish",
  "Points out the bill that needs attention",
];

const PRIVACY_POINTS = [
  { icon: ShieldCheck, title: "Yours alone", text: "Database rules tie every record to your account. No one else can read or change it." },
  { icon: Lock, title: "Private files", text: "Documents live in a private bucket. Every download link expires after 60 seconds." },
  { icon: KeyRound, title: "Secure sign-in", text: "Email verification, hashed passwords and secure, HTTP-only session cookies." },
  { icon: Trash2, title: "Leave anytime", text: "Delete your account and everything in it, permanently, from Settings." },
];

export default function LandingPage() {
  const today = todayInTimeZone("Asia/Manila");
  const schedule = [0, 1, 2, 3].map((index) => occurrenceAt("2027-01-31", "monthly", index));

  return (
    <>
      <Suspense>
        <AccountDeletedNotice />
      </Suspense>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-14 pb-16 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-14 lg:pb-24">
          <div>
            <p className="eyebrow">Personal organizer · Private by default</p>
            <h1 className="mt-5 font-display text-[3.1rem] leading-[0.98] tracking-tight sm:text-[4.4rem]">
              Everyday life, <em className="text-primary">neatly</em> in one place.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              LifeHub brings your tasks, bills, reminders, expenses, notes and important documents together — so
              nothing slips, and you always know where things stand.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-6 text-[0.95rem]">
                <Link href="/signup">
                  Create your free account <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-6 text-[0.95rem]">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["No credit card", "Works on any device", "Your data stays yours"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-primary" aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <figure className="relative">
            <ProductPreview today={today} />
            <figcaption className="mt-3 text-center text-xs text-muted-foreground">
              The LifeHub dashboard, shown with sample data.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 border-t bg-canvas">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow">What&apos;s inside</p>
            <h2 id="features-heading" className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
              Six everyday tools, one calm home.
            </h2>
            <p className="mt-4 text-muted-foreground">
              No boards to configure, no templates to learn. Just the things ordinary life actually runs on.
            </p>
          </div>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="bg-card p-6 sm:p-7">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border bg-card p-6 sm:p-8">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Repeat className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-3xl">Repeating bills that get the calendar right.</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Rent due on the 31st? LifeHub moves it to the last day of shorter months and back again — and handles
                leap years — so a monthly bill never drifts.
              </p>
              <ol className="mt-6 flex flex-wrap gap-2" aria-label="Example monthly schedule starting January 31">
                {schedule.map((date, index) => (
                  <li key={date} className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
                    <span className="block text-[11px] text-muted-foreground">{index === 0 ? "First due" : `Month ${index + 1}`}</span>
                    <span className="tabular font-medium">{formatISODate(date, "short")}</span>
                  </li>
                ))}
              </ol>
            </article>
            <article className="rounded-2xl border bg-card p-6 sm:p-8">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <LayoutDashboard className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-3xl">Money, exact to the centavo.</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Amounts are stored as whole centavos, never rounded floating-point numbers, and totals are calculated
                in the database. Pesos by default — switch currency any time without rewriting your history.
              </p>
              <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
                {[
                  ["₱0.10 + ₱0.20", "₱0.30"],
                  ["Currency", "PHP ₱"],
                  ["Bank links", "None"],
                ].map(([term, value]) => (
                  <div key={term} className="rounded-lg border bg-muted/50 px-3 py-2">
                    <dt className="text-[11px] text-muted-foreground">{term}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-t">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <p className="eyebrow">How it works</p>
          <h2 id="how-heading" className="mt-4 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
            Set up in minutes. Useful every day.
          </h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t pt-6">
                <span className="font-display text-5xl text-primary">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Privacy */}
      {/* Companion */}
      <section id="companion" aria-labelledby="companion-heading" className="scroll-mt-20 border-t bg-canvas">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14">
          <div>
            <p className="eyebrow">Your companion</p>
            <h2 id="companion-heading" className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
              A friendly nudge, <em className="text-primary">never</em> in the way.
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
              A small companion keeps you company through the day — always beside your tasks, bills and
              numbers, never instead of them.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {COMPANION_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> {point}
                </li>
              ))}
            </ul>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DAY_POSES.map(({ pose, label, text, phase }) => (
              <li key={pose} className="overflow-hidden rounded-2xl border bg-card">
                <div aria-hidden="true" className="relative flex h-36 items-end justify-center overflow-hidden sm:h-40">
                  <span className="absolute inset-0 bg-companion-glow" />
                  <CompanionFigure pose={pose} className={`relative h-32 sm:h-36 ${phase}`} />
                </div>
                <div className="border-t px-3 py-2.5">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="privacy" aria-labelledby="privacy-heading" className="scroll-mt-20 border-t bg-foreground text-background">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-background/60 uppercase">Privacy &amp; security</p>
            <h2 id="privacy-heading" className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
              Built for the things you&apos;d rather keep private.
            </h2>
            <p className="mt-4 text-background/70">
              Bills, spending and personal documents deserve better than a spreadsheet in someone&apos;s shared drive.
            </p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2">
            {PRIVACY_POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-background/15 p-6">
                <Icon className="size-5 text-[oklch(0.8_0.09_160)]" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-background/70">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20 border-t bg-canvas">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-heading" className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
              Good questions.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Something else on your mind?{" "}
              <Link href="/contact" className="font-medium text-foreground underline underline-offset-4">
                Get in touch
              </Link>
              .
            </p>
          </div>
          <Faq />
        </div>
      </section>

      {/* CTA */}
      <section aria-labelledby="cta-heading" className="overflow-hidden border-t">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-end gap-x-10 px-5 pt-20 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-col items-start gap-6 pb-8 md:pb-20 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <h2 id="cta-heading" className="max-w-xl font-display text-4xl leading-tight sm:text-5xl">
              Give everyday life a single, <em className="text-primary">quiet</em> home.
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-6">
                <Link href="/signup">
                  Get started free <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-6">
                <Link href="/login">I have an account</Link>
              </Button>
            </div>
          </div>
          {/* The companion waves goodbye from the bottom edge of the page's closing section. */}
          <div aria-hidden="true" className="relative mx-auto flex w-60 justify-center md:w-auto">
            <span className="absolute inset-0 bg-companion-glow" />
            <CompanionFigure pose="welcome" className="relative h-40 md:h-56" />
          </div>
        </div>
      </section>
    </>
  );
}
