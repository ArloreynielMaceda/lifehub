"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { resendVerification } from "../actions";

export function ResendVerification({ email, className }: { email: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={pending || sent}
      onClick={() =>
        startTransition(async () => {
          const result = await resendVerification(email);
          if (result.ok) {
            setSent(true);
            toast.success(result.message ?? "Confirmation email sent.");
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {pending ? <Spinner aria-hidden="true" /> : null}
      {sent ? "Confirmation email sent" : "Resend confirmation email"}
    </Button>
  );
}
