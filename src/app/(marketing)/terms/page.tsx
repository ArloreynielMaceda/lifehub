import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="September 30, 2026"
      intro="These terms describe how you may use LifeHub. By creating an account, you agree to them."
    >
      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must provide a valid email address and keep your password secure.</li>
          <li>You are responsible for activity under your account. Tell us promptly if you suspect unauthorized access.</li>
          <li>One person per account. Accounts are for personal use.</li>
        </ul>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          You own the content you add to LifeHub. You grant us only the permissions needed to store, process and display
          it back to you in order to run the service. Don&apos;t upload content you don&apos;t have the right to store, or anything
          illegal or harmful.
        </p>
      </section>
      <section>
        <h2>Not financial advice</h2>
        <p>
          LifeHub is a manual personal organizer. It does not connect to banks, move money, or provide financial, legal or
          tax advice. Totals and reminders are based only on what you enter; please double-check important dates and
          amounts.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          We work to keep LifeHub available and your data safe, but the service is provided &quot;as is&quot; without warranties.
          Reminders and notifications may be delayed or missed, so don&apos;t rely on them as your only record of critical
          deadlines. Keep your own copies of important documents.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Don&apos;t attempt to access other users&apos; data or disrupt the service.</li>
          <li>Don&apos;t use automated means to create accounts or overload the service.</li>
          <li>We may suspend accounts that violate these terms.</li>
        </ul>
      </section>
      <section>
        <h2>Ending your use</h2>
        <p>
          You can delete your account at any time in Settings, which permanently removes your data. We may update these
          terms; if changes are significant we will let you know in the app before they take effect.
        </p>
      </section>
    </LegalPage>
  );
}
