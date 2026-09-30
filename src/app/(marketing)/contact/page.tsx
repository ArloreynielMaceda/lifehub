import { Mail } from "lucide-react";
import type { Metadata } from "next";

import { contactEmail } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const email = contactEmail();
  return (
    <section className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-20">
      <p className="eyebrow">Contact</p>
      <h1 className="mt-4 font-display text-5xl leading-tight">We&apos;d love to hear from you.</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
        Questions, feedback, a bug to report or a feature you&apos;d like to see — send us a note and we&apos;ll reply as soon
        as we can.
      </p>
      <div className="mt-10 flex items-start gap-4 rounded-2xl border bg-card p-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Mail className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">Email</p>
          {email ? (
            <p className="mt-1 text-sm">
              <span className="font-medium">{email}</span>{" "}
              <a href={`mailto:${email}`} className="ml-1 text-primary underline underline-offset-4">
                Write to us
              </a>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              A support address hasn&apos;t been published yet. Please check back soon.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            For your security, never send passwords or full ID numbers by email.
          </p>
        </div>
      </div>
    </section>
  );
}
