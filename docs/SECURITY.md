# Security model and production checklist

## How data is protected

| Layer | What it does |
| --- | --- |
| **Proxy** (`src/proxy.ts`) | Refreshes the Supabase session cookie on every request (`getClaims()` validates the JWT) and redirects signed-out visitors away from private routes. Private responses get `Cache-Control: private, no-store`. |
| **App layout** | Re-checks the session server-side before rendering any private page. |
| **Server Actions** | Every action re-authenticates (`getActionContext`), validates input with Zod, and never accepts `user_id` from the client. Malformed IDs are rejected before any query. |
| **Row Level Security** | Enabled on every table. Policies allow `select/insert/update/delete` only where `user_id = auth.uid()`. The `anon` role has no table access. |
| **Column grants** | Clients can only write specific columns (e.g. they cannot set `user_id`, `completed_at`, a transaction's `currency`, or a notification's content). |
| **Constraints & triggers** | Check constraints on lengths, amounts, enums, dates and storage paths; composite FKs tie bill history to the bill's owner, routine completions to the routine's owner, and bill-payment expenses to the payment's owner; quota trigger limits documents per user; a trigger only accepts routine completions on scheduled, non-future dates (user's time zone); a trigger stops a bill-payment expense's amount/type from being edited out of sync with the bill. |
| **Functions** | Aggregations are `SECURITY INVOKER` (RLS applies). `SECURITY DEFINER` functions pin `search_path = ''` and act only on `auth.uid()`; the all-users generator is executable only by `service_role`. |
| **Storage** | Private bucket, 10 MB limit, MIME allow-list (PDF/JPEG/PNG). Policies restrict each user to the folder named after their `auth.uid()`. Object names are random UUIDs. Uploads are verified server-side (size, content type and magic bytes) before becoming visible; mismatches are deleted. Downloads use signed URLs that expire after 60 seconds. |
| **HTTP headers** | CSP (`frame-ancestors 'none'`, `object-src 'none'`, connect/img limited to self + Supabase), `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive permissions policy, HSTS in production, no `X-Powered-By`. |
| **Errors** | Users see friendly messages; logs contain error codes only (no emails, passwords, record contents, SQL or stack traces). Error boundaries never render error messages. |

### Money and dates

- Money is stored as `bigint` minor units with an ISO currency code per row; parsing uses
  string/BigInt arithmetic and totals are summed in Postgres. Changing the preferred currency
  never rewrites past records.
- Due dates are Postgres `date` values; "today" comes from the user's IANA time zone.
- Recurrence is computed from the anchor date (month-end and leap-year safe). Marking a bill paid
  is idempotent (compare-and-swap + unique `(bill_id, due_date)`), as is notification generation
  (unique `(user_id, dedupe_key)`).
- **Available money never double-counts bills.** Actual money comes only from `transactions`.
  Paying a bill creates at most one linked expense (unique `transactions.bill_occurrence_id`);
  unpaid bills are projected from schedules and never stored as spending. Undo removes the
  linked expense; deleting a bill keeps past expenses (the link is set to null).
- **Routines** store only their schedule. Each completed date is one row in `task_completions`
  (unique per routine and date), so completing one day never affects another.

### Keys

- The **publishable** key is public by design; RLS is what protects data.
- The **secret** key is used only by `/api/cron/reminders`, which requires `Authorization:
  Bearer $CRON_SECRET` (constant-time comparison).

## Production security checklist

- [ ] Migrations applied; **Security Advisor** shows no RLS/`search_path` warnings for LifeHub objects.
- [ ] `documents` bucket is **private** with the 10 MB limit and MIME allow-list.
- [ ] `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are set only as server env vars (never `NEXT_PUBLIC_`).
- [ ] `.env.local` is not committed (`git status` shows it ignored).
- [ ] Auth → **Confirm email** is ON; minimum password length is 8; leaked-password protection enabled (Pro plans).
- [ ] Auth → Site URL and Redirect URLs list only your domains (no wildcards for arbitrary hosts).
- [ ] Custom SMTP configured for auth emails (the built-in sender is heavily rate-limited).
- [ ] Auth rate limits reviewed (sign-ups, sign-ins, password reset emails).
- [ ] `CRON_SECRET` is a long random value; cron route returns `401` without it.
- [ ] Vercel: enable **Firewall / Attack Challenge Mode** or rate-limit rules if abuse appears (serverless in-memory rate limiting is unreliable, so rely on Supabase Auth limits + Vercel WAF).
- [ ] Enable Supabase **Point-in-Time Recovery** or scheduled backups for production data.
- [ ] Privacy Policy and Terms reviewed by someone qualified for your jurisdiction (e.g. the Philippine Data Privacy Act of 2012) and `NEXT_PUBLIC_CONTACT_EMAIL` set.
- [ ] Run the live suites against a **test** project before launch: `npm run test:integration` and `npm run test:e2e`.

## Known limitations

- `script-src` allows `'unsafe-inline'` because Next.js injects inline bootstrap scripts; moving to
  nonce-based CSP would require rendering every page dynamically.
- Upload verification runs in the finalize step with the user's session; a user who bypasses the
  UI could mark their *own* unverified upload as ready, but files are only ever served back to
  their owner, with the bucket MIME allow-list still enforced by Storage.
- The document quota trigger counts rows without a lock; two simultaneous uploads at the limit
  could exceed it by one.
