import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, contactEmail } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <LegalPage
      title="Privacy Policy"
      updated="September 30, 2026"
      intro="LifeHub is a personal organizer. This policy explains what we store, why, and the choices you have. In short: your data is used only to run the service for you, and it is never sold."
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: your email address, name, and password (stored only as a secure hash by our authentication provider).</li>
          <li>Content you add: tasks, bills, reminders, transactions, notes, notifications and documents you upload.</li>
          <li>Preferences: currency, time zone and whether you want reminder emails.</li>
          <li>Basic technical logs needed to keep the service secure and working (for example, error codes). We do not log the contents of your records.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To provide LifeHub: show your dashboard, send in-app notifications and, if you opt in, reminder emails.</li>
          <li>To secure accounts and prevent abuse.</li>
          <li>We do not sell your data, show ads, or use your content to build profiles about you.</li>
        </ul>
      </section>
      <section>
        <h2>Where it is stored</h2>
        <p>
          Data is stored with our infrastructure providers (Supabase for the database, authentication and file storage;
          Vercel for hosting). Access is restricted per account by database-level security rules. Uploaded documents are
          kept in a private storage bucket and are only accessible through short-lived links created for you.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Edit or delete any record at any time.</li>
          <li>Turn reminder emails on or off in Settings.</li>
          <li>Delete your account from Settings. This permanently removes your profile, records and documents.</li>
        </ul>
      </section>
      <section>
        <h2>Retention</h2>
        <p>
          We keep your data while your account is active. Read notifications are removed automatically after 90 days.
          When you delete your account, your data is deleted from the live database immediately; provider backups expire
          on their normal schedule.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about privacy? {email ? <>Email <a className="underline underline-offset-4" href={`mailto:${email}`}>{email}</a>.</> : <>Use the details on our <Link className="underline underline-offset-4" href="/contact">contact page</Link>.</>}
        </p>
      </section>
    </LegalPage>
  );
}
