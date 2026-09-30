# Supabase setup (Supabase Cloud)

LifeHub uses a Supabase Cloud project for Postgres, Auth and Storage. No Docker or local
Supabase stack is needed.

> Use **two projects** if you can: one for production and one for development/testing. The
> automated integration and E2E suites create and delete users, so never point them at
> production.

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your users (for the Philippines: *Southeast Asia (Singapore)*).
3. Save the database password somewhere safe (you only need it for the CLI).

## 2. Get the API values

Dashboard → **Project Settings → API Keys** (and **Data API** for the URL):

| Value | Env variable | Where it is used |
| --- | --- | --- |
| Project URL `https://<ref>.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` | browser + server |
| Publishable key `sb_publishable_…` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server |
| Secret key `sb_secret_…` | `SUPABASE_SECRET_KEY` | **server only**, cron job |

Older projects that only show the legacy `anon` / `service_role` JWT keys still work: put them in
`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` instead.

The secret key bypasses Row Level Security. It is only read by `src/lib/supabase/admin.ts`,
which is imported only by `/api/cron/reminders`. Never prefix it with `NEXT_PUBLIC_`.

## 3. Apply the database migrations

The schema lives in `supabase/migrations/` and must be applied in filename order:

| File | Contents |
| --- | --- |
| `20260930000100_core_schema.sql` | enums, tables, constraints, indexes, triggers (profile on sign-up, `updated_at`, task completion, document quota) |
| `20260930000200_rls_policies.sql` | RLS enabled on every table, owner-only policies, explicit column-level grants |
| `20260930000300_functions.sql` | aggregation RPCs, idempotent `mark_bill_occurrence` / `undo_bill_occurrence`, notification generation, `delete_my_account` |
| `20260930000400_storage.sql` | private `documents` bucket (10 MB, PDF/JPEG/PNG) and per-user folder policies |
| `20261001000100_task_routines.sql` | recurring routines: `tasks.kind` + schedule columns, `task_completions` (one row per completed date) with RLS, routine reminders in notifications |
| `20261001000200_bill_payments.sql` | bill payments ⇄ expenses: `bill_occurrences.outcome` (paid/skipped), `transactions.bill_occurrence_id` (one expense per payment), `mark_bill_occurrence` v2, `money_summary` |

All migrations are additive. The two `20261001…` files add columns with defaults or nulls, one
table, constraints that existing rows already satisfy, and replace RPC functions; they never
drop or rewrite data. Already-applied projects only need `npx supabase db push`, which applies
the new files and skips the ones already recorded.

> **Order matters:** apply the migrations **before** running or deploying app code from the
> same revision. The app reads the new columns (e.g. `tasks.kind`), so an old database with new
> code shows "Could not load tasks" until `db push` has run.

### Option A — Supabase CLI (recommended, no Docker needed for these commands)

```bash
npx supabase login                          # opens the browser once
npx supabase link --project-ref <project-ref>
npx supabase db push                        # applies supabase/migrations to the linked cloud project
```

`db push` records applied migrations, so re-running it only applies new files.

### Option B — SQL editor

Dashboard → **SQL Editor** → paste each migration file's contents in order → **Run**.

### Verify

Dashboard → **Database → Tables**: every table shows **RLS enabled**. Dashboard →
**Advisors → Security Advisor** should report no RLS warnings for LifeHub tables.

## 4. Storage

The storage migration creates the private `documents` bucket and its policies. Check
Dashboard → **Storage**: the bucket is **not public**, the size limit is 10 MB and the allowed
MIME types are `application/pdf, image/jpeg, image/png`.

Objects are stored at `<user id>/<random uuid>.<ext>`; the policies only allow a user to read,
write or delete inside the folder named after their own `auth.uid()`.

## 5. Authentication settings

Dashboard → **Authentication**:

1. **Sign In / Providers → Email**: enabled. Keep **Confirm email** ON (recommended).
   Set the minimum password length to **8** to match the app's validation.
2. **URL Configuration**:
   - **Site URL**: your production URL, e.g. `https://lifehub.example.com`
     (use `http://localhost:3000` for a dev-only project).
   - **Redirect URLs** (allow list):
     - `http://localhost:3000/**`
     - `https://<your-production-domain>/**`
     - `https://*-<your-vercel-team>.vercel.app/**` (optional, for preview deployments)
3. **Emails → Templates** (recommended — makes links work across devices). Replace the link in
   these templates:

   **Confirm signup**
   ```html
   <h2>Confirm your email</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Confirm your email address</a></p>
   ```

   **Reset password**
   ```html
   <h2>Reset your password</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
   ```

   If you keep the default templates, links still work through the PKCE `code` exchange in
   `/auth/confirm`, but only when opened in the same browser that requested them.

   **Shortcut:** `supabase/config.toml` already contains these auth settings (confirmations on,
   8-character passwords with letters and digits, redirect URLs, and the two templates in
   `supabase/templates/`). After `supabase link`, you can apply them with:
   ```bash
   # First set site_url / additional_redirect_urls in supabase/config.toml to your real URLs.
   npx supabase config diff   # preview
   npx supabase config push   # asks before writing each changed setting
   ```
   Only settings declared in the file are changed; review the diff before confirming.
4. **SMTP**: Supabase's built-in email service is rate-limited and meant for testing. For
   production, configure a custom SMTP provider under **Authentication → Emails → SMTP Settings**.
5. **Rate limits**: review **Authentication → Rate Limits** (sign-ups, sign-ins, OTP/email).

## 6. Optional: generate types from the live schema

`src/types/database.ts` is maintained by hand to match the migrations. To regenerate it:

```bash
npx supabase gen types typescript --project-id <project-ref> --schema public > src/types/database.ts
```

## 7. Optional: demo data

`supabase/seed-demo.sql` inserts clearly labelled sample data for **one existing demo account**
(set the email at the top of the file). Only run it in a development project.
