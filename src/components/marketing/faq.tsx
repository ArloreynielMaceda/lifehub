"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const FAQ_ITEMS = [
  {
    q: "Is LifeHub free?",
    a: "Yes. Everything described on this page is free to use while LifeHub is in early access. If optional paid plans are ever introduced, you'll be told well in advance and the core organizer will stay usable.",
  },
  {
    q: "Does LifeHub connect to my bank account?",
    a: "No. LifeHub is a manual tracker by design: you log income and expenses yourself. There are no bank connections, and LifeHub doesn't give financial advice.",
  },
  {
    q: "Who can see my data?",
    a: "Only you. Every record is tied to your account and protected by database-level access rules, so other users can't read or change it even if they tried. Documents are stored in a private vault and opened through links that expire after 60 seconds.",
  },
  {
    q: "Which currencies are supported?",
    a: "Philippine peso (PHP) is the default, and you can switch to USD, EUR, GBP, JPY, SGD and more in Settings. Amounts are stored exactly — never rounded — and past entries keep the currency they were recorded in.",
  },
  {
    q: "How do repeating bills and reminders work?",
    a: "Choose daily, weekly, monthly or yearly. When you mark one paid or done, it moves to the next date automatically. Month-end dates stay sensible: a bill due on the 31st falls on the last day of shorter months.",
  },
  {
    q: "Can I use it on my phone?",
    a: "Yes. LifeHub works in any modern browser and adapts to phones, tablets and desktops. There's nothing to install.",
  },
  {
    q: "Can I delete my account?",
    a: "Anytime, from Settings. Deleting your account permanently removes your profile, all your records and every file in your document vault.",
  },
];

export function Faq() {
  return (
    <Accordion type="single" collapsible className="divide-y rounded-2xl border bg-card px-5 sm:px-6">
      {FAQ_ITEMS.map((item) => (
        <AccordionItem key={item.q} value={item.q} className="border-none">
          <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">{item.q}</AccordionTrigger>
          <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
