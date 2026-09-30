# LifeHub

A calm, private personal organizer: **tasks, bills & reminders, expenses, notes and a document
vault** in one place. Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4,
shadcn/ui and Supabase (Postgres, Auth, Storage).

- Real data only: every screen reads and writes your Supabase project, protected by Row Level Security.
- Money is exact (integer minor units, PHP by default); dates are time-zone aware; recurring bills are month-end and leap-year safe.
- Responsive from 320 px phones to large desktops, keyboard accessible.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [What you still need to provide](#what-you-still-need-to-provide)
- [Troubleshooting](#troubleshooting)
- Docs: [Supabase setup](docs/SUPABASE_SETUP.md) · [Deployment](docs/DEPLOYMENT.md) · [Security & checklist](docs/SECURITY.md) · [Development plan](DEVELOPMENT_PLAN.md) · [Tasks & check results](TASKS.md)

## Features

| Area | What you get |
| --- | --- |
| **Auth** | Email/password sign-up with email verification, sign in/out, forgot & reset password, protected routes, profile & account settings, account deletion. |
| **Dashboard** | Greeting and date in your time zone, tasks due today/overdue (tick them off inline), this week's strip, upcoming bills and reminders (mark paid inline), this month's income/expenses/net, recent transactions, quick-add actions. Empty states for new users — no fake numbers. |
| **Tasks** | Create/edit/complete/delete; title, notes, due date, priority, status (pending / in progress / completed), category; search, filter, sort; Open/Today/Overdue/Upcoming/Completed views; list and month calendar views; optimistic completion with undo. |
| **Routines** | Recurring routines ("Take vitamins", "Exercise Mon/Wed/Fri"): every day, weekdays, weekends or chosen days; start and optional end date; optional reminder time; tick off today (or an earlier day) without re-creating anything; 7-day completion history; pause, resume, edit, delete; shown in "Today's routines", the Routines tab, the calendar and the dashboard. |
| **Bills & reminders** | One-time or daily/weekly/monthly/yearly; optional amount; clear status (Upcoming · unpaid, Due today, Overdue, Paid, Skipped/Cancelled); **Mark as paid** with the amount actually paid, date and method; skip an occurrence; undo (idempotent, safe to retry); history. |
| **Expenses & available money** | Income & expense log; paid bills become one linked expense each (never twice). **Available now** = income − paid bills − other expenses; **After upcoming bills** = available now − unpaid bills due in the period. Category and 6-month trend charts (with table views); paginated history. |
| **Notes** | Autosave with serialized saves, save status, Ctrl/Cmd+S, unsaved-change protection, pin, search, relative timestamps. |
| **Document vault** | PDF/JPEG/PNG up to 10 MB; direct-to-storage upload with progress; server-side signature verification; private bucket; per-user folders; 60-second signed URLs for preview/download; delete. |
| **Notifications** | In-app notification center (bell + page) for due-soon, due-today and overdue items; generated idempotently; optional daily email digest via a Vercel Cron job. |

## Quick start

Requirements: **Node.js 20.9+** (developed on Node 24) and a **Supabase Cloud** project. Docker is not needed.

```bash
cd lifehub
npm install
cp .env.example .env.local        # then fill in the Supabase values
```

1. Create a Supabase project and copy the **Project URL** and **publishable key** into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Set
   `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
2. Apply the migrations to your project:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   (or paste the files in `supabase/migrations/` into the SQL editor, in order).
3. In Supabase → Authentication → URL Configuration, add `http://localhost:3000/**` to the
   Redirect URLs and (recommended) update the email templates — see
   [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md#5-authentication-settings).
4. Start the app:
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000>, create an account, confirm your email, and you're in.

Without Supabase variables the public pages still work and private pages show setup instructions.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (Turbopack) on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (flat config, Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | Generates route types, then `tsc --noEmit` (strict) |
| `npm test` | All Vitest suites (unit, server actions, database; live suite auto-skips without env) |
| `npm run test:unit` | Pure logic + server-action tests |
| `npm run test:db` | Runs the SQL migrations in an in-process Postgres (PGlite) and tests RLS, grants, triggers and functions |
| `npm run test:integration` | Live RLS/storage suite against a **test** Supabase project (needs `TEST_SUPABASE_*`) |
| `npm run test:e2e` | Playwright end-to-end tests (smoke tests always; full flows need `TEST_SUPABASE_*`) |
| `npm run check` | typecheck + lint + tests + build |

## Project structure

```
src/
  app/
    (marketing)/        landing, privacy, terms, contact
    (auth)/             login, signup, forgot-password, reset-password
    (app)/              dashboard, tasks, bills, expenses, notes, documents, notifications, settings
    auth/confirm/       email link handler (token_hash or PKCE code)
    api/cron/reminders/ scheduled notification + email job
  components/           ui/ (shadcn), app/ (shell), shared/, marketing/
  features/<feature>/   schemas.ts · queries.ts (server reads) · actions.ts (server mutations) · components/
  lib/                  supabase clients, dates, recurrence, money, documents, validation, email
  proxy.ts              session refresh + route protection (Next.js 16 "proxy", formerly middleware)
supabase/migrations/    schema, RLS, functions, storage policies
tests/                  unit/, actions/, db/ (PGlite), integration/ (live)
e2e/                    Playwright specs
docs/                   setup, deployment, security
```

Design decisions are recorded in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## Testing

- **Unit** (`tests/unit`): money parsing/formatting (no float drift), recurrence (month-end, leap
  years, century years), time-zone "today", safe redirects, file signature detection, file names.
- **Server actions** (`tests/actions`): with a recording Supabase mock — authentication required,
  server-side validation, no client `user_id`, not-found on RLS-hidden rows, exact amounts in the
  profile currency, currency preserved on edit, month-end-safe mark-paid arguments, upload
  verification and cleanup, signed URLs only for visible documents, safe post-login redirects,
  no leaking of database error text.
- **Database** (`tests/db`): the real migrations executed in PGlite (Postgres compiled to
  WebAssembly — no Docker) with Supabase's roles, `auth.uid()`, storage schema and default
  grants recreated. Verifies RLS isolation between two users, anon denial, column grants,
  constraints, idempotent mark-paid/undo, notification dedupe, aggregation correctness, storage
  folder policies and account deletion cascade.
- **Live integration** (`tests/integration`): the same guarantees through the public Supabase
  APIs of a real project.
- **E2E** (`e2e/`): smoke (landing, legal pages, form validation, route protection, security
  headers, no horizontal scroll at 320 px) plus full flows — sign up + email verification via a
  generated link, sign in/out, password reset, tasks, bills, transactions, notes, documents and
  cross-user access.

To run the live suites, create a separate Supabase **test** project, apply the migrations, put its
values in `.env.local` both as the app's `NEXT_PUBLIC_*` variables and as `TEST_SUPABASE_*`, then:

```bash
npm run test:integration
npm run test:e2e
```

## Deployment

Vercel is the target. The short version: import the repo (root directory `lifehub`), add the
environment variables, deploy, then add your domain to Supabase Auth's Site URL and Redirect URLs.
Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What you still need to provide

| Item | Where | Needed for |
| --- | --- | --- |
| Supabase project URL + publishable key | `.env.local` / Vercel env | Everything behind sign-in |
| Migrations applied to that project | `npx supabase db push` or SQL editor | Tables, RLS, storage bucket |
| Auth redirect URLs + Site URL | Supabase → Authentication → URL Configuration | Email confirmation & password reset links |
| (Recommended) updated email templates | Supabase → Authentication → Emails | Links that work across devices |
| (Recommended) custom SMTP | Supabase → Authentication → SMTP | Reliable auth email delivery |
| `SUPABASE_SECRET_KEY` + `CRON_SECRET` | Vercel env | Daily notification job |
| `RESEND_API_KEY` + `EMAIL_FROM` (verified domain) | Vercel env | Reminder emails (not verified in this repo) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Vercel env | Contact details on /contact and /privacy |
| A separate test project + `TEST_SUPABASE_*` | `.env.local` / CI | Live RLS suite and full E2E flows |
| Legal review of Privacy Policy / Terms | `src/app/(marketing)/privacy`, `terms` | Launch |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Private pages show **"Connect Supabase to continue"** | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are missing. Add them to `.env.local` and restart `npm run dev` (on Vercel: add them and redeploy — `NEXT_PUBLIC_*` values are baked in at build time). |
| Sign-up works but the email link says **"invalid or has expired"** | Add your URL to Supabase **Redirect URLs**; make sure `NEXT_PUBLIC_SITE_URL` matches where the app runs; with default templates, open the link in the same browser, or switch to the `token_hash` templates. Links are single-use. |
| **"Please confirm your email first"** | Click the confirmation link or use **Resend confirmation email** on the sign-in page. |
| No confirmation email arrives | The built-in Supabase sender is rate-limited (a few emails per hour). Configure custom SMTP. Check spam. |
| You land on **"Your database needs an update"** (`/update-required`), or logs show `column … does not exist` / `[schema]` errors | The app code is newer than the database. Run `npx supabase db push` (preview first with `--dry-run`), then reload. The page turns into "Your database is up to date" once all migrations are applied. |
| Uploads fail with **"Uploads are unavailable"** | The `documents` bucket or its policies are missing — apply `20260930000400_storage.sql`. |
| Image previews don't load | The CSP only allows images from the Supabase URL present at **build** time; rebuild after changing `NEXT_PUBLIC_SUPABASE_URL`. |
| Dates look a day off | Set the right time zone in **Settings → Preferences**. |
| Cron route returns `401` / `503` | `401`: wrong/missing bearer token. `503`: `CRON_SECRET` or `SUPABASE_SECRET_KEY` not set. |
| `npm run test:integration` / E2E flows are skipped | Expected without `TEST_SUPABASE_*` variables. |
