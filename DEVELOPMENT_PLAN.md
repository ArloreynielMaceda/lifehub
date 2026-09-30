# LifeHub — Development Plan

LifeHub is a personal life organizer: tasks, bills & reminders, expenses, notes and a private
document vault in one secure place. This document captures the architecture, data model,
security model and milestones for the MVP.

## 1. Guiding principles

- **Real data only.** Every screen reads from and writes to Supabase. No mock data sources.
- **Server first.** Server Components by default; Client Components only for interactivity.
  Mutations go through Server Actions that re-validate input with Zod and rely on RLS.
- **Defense in depth.** Proxy session refresh → layout auth guard → per-action auth check →
  Postgres Row Level Security → database constraints.
- **Exact money.** Monetary values are stored as `bigint` minor units (e.g. centavos) with an
  ISO-4217 currency code per row. No floating-point arithmetic on money.
- **Calendar dates are civil dates.** Due dates are stored as Postgres `date` (no time zone).
  "Today" is computed in the user's IANA time zone (stored on the profile).
- **Supabase Cloud only.** No Docker or local Supabase stack. Development runs `next dev`
  against a Supabase Cloud project.

## 2. Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, shadcn/ui (Radix base), Lucide icons |
| Data / Auth / Files | Supabase Postgres, Supabase Auth via `@supabase/ssr`, Supabase Storage |
| Validation / Forms | Zod 4, React Hook Form + `@hookform/resolvers` |
| Charts / Dates | Recharts 3, date-fns 4 (display); custom civil-date utilities (recurrence math) |
| Tests | Vitest (unit + optional live-Supabase RLS suite), Playwright (E2E) |
| Hosting | Vercel |

## 3. Architecture

```
src/
  app/
    (marketing)/          public landing, privacy, terms, contact
    (auth)/               login, signup, forgot-password, reset-password, check-email
    auth/confirm/         email verification + recovery link handler (route handler)
    (app)/                authenticated shell: dashboard, tasks, bills, expenses, notes,
                          documents, notifications, settings
    api/cron/reminders/   scheduled notification + email digest job (service key)
  components/
    ui/                   shadcn/ui primitives
    app/                  app shell (sidebar, mobile nav, notification bell, page header)
    shared/               empty states, confirm dialog, form fields, money, pagination
    marketing/            landing page sections and product previews
  features/<feature>/     schemas.ts (Zod), queries.ts (server reads), actions.ts (server
                          mutations), components/ (feature UI)
  lib/
    supabase/             server/browser/proxy/admin clients, env handling
    dates.ts              civil-date helpers (tz-aware "today", add days/months/years)
    recurrence.ts         recurrence engine (month-end + leap-year safe)
    money.ts              parse/format minor units, currency table
    ...                   safe redirects, file signature sniffing, action results
  proxy.ts                session refresh + route protection
supabase/
  migrations/             versioned SQL (tables, RLS, functions, storage policies)
  seed.sql                optional demo data for a dedicated demo account (dev only)
tests/                    unit + integration tests (Vitest)
e2e/                      Playwright specs
docs/                     Supabase setup, deployment, security checklist
```

### Request flow

1. `src/proxy.ts` creates a Supabase server client bound to request/response cookies and
   calls `auth.getClaims()` to refresh the session; unauthenticated requests to app routes are
   redirected to `/login?next=…`.
2. The `(app)` layout calls `getCurrentUser()` (cached per request) and redirects if absent.
3. Pages query Supabase through `features/*/queries.ts` using the cookie-bound server client.
   RLS scopes every query to `auth.uid()`.
4. Client forms call Server Actions in `features/*/actions.ts`, which (a) re-authenticate,
   (b) validate with Zod, (c) write via Supabase (RLS enforces ownership; `user_id` defaults to
   `auth.uid()` and is never taken from the client), (d) `revalidatePath` and return a typed
   `ActionResult`.

## 4. Database design

All private tables have `user_id uuid not null default auth.uid() references auth.users on
delete cascade`, RLS enabled, and four policies (select/insert/update/delete) restricted to
`(select auth.uid()) = user_id`.

| Table | Purpose / key columns |
| --- | --- |
| `profiles` | `id` (= auth user id), `full_name`, `currency` (ISO 4217, default `PHP`), `timezone` (IANA, default `Asia/Manila`), `email_reminders` |
| `tasks` | `title`, `description`, `due_date date`, `priority` enum, `status` enum (`pending`, `in_progress`, `completed`), `category`, `completed_at` |
| `bills` | Bills **and** reminders (`kind` = `bill`/`reminder`): `title`, `description`, `category`, `amount_minor bigint null`, `currency`, `anchor_date` (first due date), `next_due_date`, `recurrence` (`none`/`daily`/`weekly`/`monthly`/`yearly`), `status` (`active`/`completed`) |
| `bill_occurrences` | Log of paid/done occurrences: `bill_id`, `due_date`, `amount_minor`, `completed_at`; **unique (`bill_id`, `due_date`)** makes marking paid idempotent |
| `transactions` | `type` (`income`/`expense`), `amount_minor bigint > 0`, `currency`, `description`, `category`, `payment_method`, `occurred_on date`, `bill_occurrence_id` (set when the expense is a bill payment; unique → never counted twice) |
| `task_completions` | Routine history: `task_id`, `occurred_on`; **unique (`task_id`, `occurred_on`)**. Routines are `tasks` rows with `kind = 'routine'`, `repeat_days` (ISO weekdays), `starts_on`, `ends_on`, `reminder_time`, `paused_on` |
| `notes` | `title`, `content`, `pinned`, `updated_at` |
| `notifications` | `kind`, `title`, `body`, `link`, `source_type`, `source_id`, `due_date`, `dedupe_key`, `read_at`, `emailed_at`; **unique (`user_id`, `dedupe_key`)** prevents duplicates on retries |
| `documents` | `name`, `storage_path` (unique, `<user_id>/<uuid>.<ext>`), `mime_type`, `size_bytes`, `status` (`pending`/`ready`) |

Supporting objects:

- `updated_at` triggers on mutable tables; `handle_new_user` trigger creates a profile.
- Search columns (`search_text`, generated) with `pg_trgm` GIN indexes for tasks, notes,
  transactions and bills.
- Aggregation RPCs (security invoker → RLS applies): `transaction_totals`,
  `transaction_category_totals`, `transaction_monthly_trend`.
- `mark_bill_occurrence(...)`: atomic, idempotent "mark paid/done" — inserts the occurrence
  (`on conflict do nothing`) and advances `next_due_date` with compare-and-swap on the
  expected current date.
- `sync_my_notifications()` / `generate_all_notifications()`: set-based, idempotent
  notification generation that computes "today" per user time zone in SQL.
- `delete_my_account()`: removes the caller's auth user (cascade deletes rows).
- Storage bucket `documents` (private, 10 MB, PDF/JPEG/PNG only) with policies that restrict
  objects to the folder named after `auth.uid()`.

## 5. Recurrence model

- A recurring item stores an **anchor date** and the **current open occurrence**
  (`next_due_date`). Occurrence *n* is computed from the anchor (never by chaining), so
  Jan 31 monthly → Feb 28/29 → Mar 31 → Apr 30, and Feb 29 yearly → Feb 28 in common years.
- Marking an occurrence done inserts into `bill_occurrences` (unique per date) and advances
  `next_due_date` to the first occurrence after it; a retried request fails the
  compare-and-swap and the insert conflicts, so nothing is duplicated.
- One-time items become `completed` when marked done.

## 6. Security requirements

- Supabase keys: publishable key (`sb_publishable_…`, legacy anon key accepted) in the
  browser; secret key (`sb_secret_…`, legacy service role accepted) **only** in the cron route.
- Zod validation on the server for every action; typed, sanitized errors returned to UI;
  internal errors logged without secrets and never shown to users.
- No client-supplied `user_id` is ever written; RLS + column defaults own the value.
- Safe `next` redirect handling (relative paths only).
- Document vault: size limit, MIME allow-list, magic-byte verification after upload,
  randomized object names, per-user folders, 60-second signed URLs, no public URLs.
- Security headers (CSP, frame-ancestors none, nosniff, referrer policy, permissions policy,
  HSTS) configured in `next.config.ts`.
- Rate limiting: Supabase Auth built-in limits; per-user document quota; guidance for Vercel
  WAF / Supabase rate limits in the security checklist.

## 7. Milestones

| Phase | Scope |
| --- | --- |
| 1 | Inspect, plan, scaffold (Next.js 16, Tailwind 4, shadcn/ui, deps) |
| 2 | Design system, landing page, legal pages, app shell & responsive navigation |
| 3 | Supabase clients, proxy, auth flows, migrations & RLS, storage policies |
| 4 | Dashboard, tasks (list + calendar), bills & reminders, expenses, notes |
| 5 | Document vault, notification center, cron/email integration structure |
| 6 | Unit/integration/E2E tests, accessibility & responsive polish, security review |
| 7 | Typecheck, lint, tests, production build, documentation |

## 8. Acceptance criteria

1. `npm run dev` runs the app locally; `npm run build` succeeds.
2. Landing page and app are responsive (320 px → desktop) and keyboard accessible.
3. Auth (sign up, verify email, sign in/out, forgot/reset password) uses Supabase Auth.
4. All features read/write real Supabase data; no fake statistics.
5. Migrations define all tables, constraints, indexes, RLS policies and storage policies.
6. Cross-user access is blocked by RLS (verified by the live RLS test suite once a project is
   connected).
7. Forms validate on client and server with friendly errors.
8. Typecheck, lint, unit tests and build are executed and results documented.
9. README, `.env.example` and setup/deployment docs are complete.
10. Remaining manual steps (Supabase project, keys, redirect URLs, email templates, cron) are
    listed explicitly.
