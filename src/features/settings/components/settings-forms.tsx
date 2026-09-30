"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert, SubmitButton } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { applyServerErrors } from "@/lib/forms";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/money";

import { deleteAccount, updatePreferences, updateProfile } from "../actions";
import { preferencesSchema, profileSchema } from "../schemas";

export function ProfileForm({ fullName, email }: { fullName: string; email: string | null }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { fullName } });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updateProfile(values);
      if (!result.ok) {
        applyServerErrors(form.setError, result.fieldErrors);
        setServerError(result.error);
        return;
      }
      toast.success(result.message ?? "Saved");
      form.reset(values);
    });
  });

  const { errors, isDirty } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4 sm:max-w-md">
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="settings-name">Name</FieldLabel>
          <Input id="settings-name" autoComplete="name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
          <FieldError errors={[errors.fullName]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="settings-email">Email</FieldLabel>
          <Input id="settings-email" value={email ?? ""} readOnly disabled />
          <FieldDescription>Your sign-in email. Contact support to change it.</FieldDescription>
        </Field>
      </FieldGroup>
      <SubmitButton pending={pending} pendingLabel="Saving…" disabled={!isDirty}>
        Save profile
      </SubmitButton>
    </form>
  );
}

export function PreferencesForm({
  currency,
  timezone,
  emailReminders,
  timeZones,
  emailConfigured,
}: {
  currency: string;
  timezone: string;
  emailReminders: boolean;
  timeZones: string[];
  emailConfigured: boolean;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(preferencesSchema),
    defaultValues: { currency, timezone, emailReminders },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePreferences(values);
      if (!result.ok) {
        applyServerErrors(form.setError, result.fieldErrors);
        setServerError(result.error);
        return;
      }
      toast.success(result.message ?? "Saved");
      form.reset(values);
    });
  });

  const { errors, isDirty } = form.formState;
  const zones = timeZones.includes(timezone) ? timeZones : [timezone, ...timeZones];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormAlert message={serverError} />
      <FieldGroup className="gap-4 sm:max-w-md">
        <Field data-invalid={!!errors.currency}>
          <FieldLabel htmlFor="settings-currency">Currency</FieldLabel>
          <NativeSelect id="settings-currency" className="w-full" {...form.register("currency")}>
            {CURRENCY_CODES.map((code) => (
              <NativeSelectOption key={code} value={code}>
                {code} — {CURRENCIES[code].name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            Used for new transactions and bills. Existing entries keep the currency they were recorded in.
          </FieldDescription>
          <FieldError errors={[errors.currency]} />
        </Field>
        <Field data-invalid={!!errors.timezone}>
          <FieldLabel htmlFor="settings-timezone">Time zone</FieldLabel>
          <NativeSelect id="settings-timezone" className="w-full" {...form.register("timezone")}>
            {zones.map((zone) => (
              <NativeSelectOption key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>Decides when &quot;today&quot; starts for due dates and reminders.</FieldDescription>
          <FieldError errors={[errors.timezone]} />
        </Field>
        <Field orientation="horizontal" className="items-start rounded-lg border p-3">
          <FieldContent>
            <FieldLabel htmlFor="settings-email-reminders">Email reminders</FieldLabel>
            <FieldDescription>
              A daily email about bills and tasks that are due or overdue.
              {emailConfigured ? "" : " Email delivery isn't set up on this server yet, so nothing will be sent until it is."}
            </FieldDescription>
          </FieldContent>
          <Controller
            control={form.control}
            name="emailReminders"
            render={({ field }) => (
              <Switch id="settings-email-reminders" checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </Field>
      </FieldGroup>
      <SubmitButton pending={pending} pendingLabel="Saving…" disabled={!isDirty}>
        Save preferences
      </SubmitButton>
    </form>
  );
}

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        setConfirmation("");
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes your profile, tasks, bills, transactions, notes, notifications and every
            document in your vault. It can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await deleteAccount({ confirmation });
              if (result && !result.ok) setError(result.error);
            });
          }}
          className="space-y-4"
        >
          <FormAlert message={error} />
          <Field>
            <FieldLabel htmlFor="delete-confirmation">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </FieldLabel>
            <Input
              id="delete-confirmation"
              value={confirmation}
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingLabel="Deleting…" variant="destructive" disabled={confirmation !== "DELETE"}>
              Permanently delete
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
