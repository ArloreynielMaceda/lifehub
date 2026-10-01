import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Sign-up details received", text: "Your name, email and password" },
  { title: "Confirm your email", text: "Activates your account" },
  { title: "Start using LifeHub", text: "Tasks, bills, notes and your vault" },
] as const;

/**
 * Where the user is in sign-up. The account only becomes usable at step 3, which makes it
 * clear that signing up alone doesn't activate anything.
 */
export function SignupSteps({ current, className }: { current: 2 | 3; className?: string }) {
  return (
    <ol aria-label="Sign-up progress" className={cn("space-y-3 rounded-xl border bg-card p-4", className)}>
      {STEPS.map((step, index) => {
        const number = index + 1;
        const state = number < current ? "done" : number === current ? "current" : "upcoming";
        return (
          <li key={step.title} className="flex items-start gap-3" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                state === "done" && "bg-primary text-primary-foreground",
                state === "current" && "border-2 border-primary text-primary",
                state === "upcoming" && "border text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : number}
            </span>
            <span className="min-w-0 text-sm">
              <span className={cn("block font-medium", state === "upcoming" && "text-muted-foreground")}>
                {step.title}
                <span className="sr-only">
                  {state === "done" ? " (done)" : state === "current" ? " (current step)" : " (not yet)"}
                </span>
              </span>
              <span className="block text-muted-foreground">{step.text}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
