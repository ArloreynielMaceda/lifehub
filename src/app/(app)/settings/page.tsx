import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import {
  DeleteAccountSection,
  PreferencesForm,
  ProfileForm,
} from "@/features/settings/components/settings-forms";
import { getUserContext } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";

export const metadata: Metadata = { title: "Settings" };

function Section({
  id,
  title,
  description,
  children,
  tone = "default",
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="grid grid-cols-1 scroll-mt-20 gap-4 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2 id={`${id}-heading`} className={tone === "danger" ? "font-semibold text-destructive" : "font-semibold"}>
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const { user, profile } = await getUserContext();
  const timeZones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [profile.timezone];

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, preferences and account." />
      <div className="max-w-4xl">
        <Section id="profile" title="Profile" description="How LifeHub greets you.">
          <ProfileForm fullName={profile.full_name} email={user.email} />
        </Section>
        <Section id="preferences" title="Preferences" description="Currency, time zone and reminder emails.">
          <PreferencesForm
            currency={profile.currency}
            timezone={profile.timezone}
            emailReminders={profile.email_reminders}
            timeZones={timeZones}
            emailConfigured={isEmailConfigured()}
          />
        </Section>
        <Section id="security" title="Password" description="Choose a strong password you don't use anywhere else.">
          <div className="sm:max-w-md">
            <ResetPasswordForm submitLabel="Change password" redirectTo={null} />
          </div>
        </Section>
        <Section
          id="danger"
          title="Delete account"
          description="Permanently remove your account and everything in it."
          tone="danger"
        >
          <DeleteAccountSection />
        </Section>
      </div>
    </>
  );
}
