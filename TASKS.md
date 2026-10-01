# LifeHub — Tasks

Status legend: `[x]` done · `[ ]` pending · `[~]` blocked on an external dependency (see notes)

## Phase 1 — Inspect, plan, initialize
- [x] Inspect working directory (empty `lifehub/` folder, nothing to preserve)
- [x] Scaffold Next.js 16.3 + React 19.2 + TypeScript strict + Tailwind v4 + ESLint 9
- [x] Install Supabase SSR, supabase-js, Zod 4, RHF, Recharts 3, date-fns 4, Vitest 5, Playwright
- [x] Initialize shadcn/ui (Radix base) and add primitives
- [x] DEVELOPMENT_PLAN.md and TASKS.md

## Phase 2 — Design system, landing, layouts
- [x] Theme tokens: warm neutrals + forest-green accent; Geist + Instrument Serif; status colours
- [x] Validated chart palette (dataviz checks: CVD ΔE 21.4, normal ΔE 26.2, ≥3:1 contrast)
- [x] Shared components: page header, empty state, confirm dialog, form bits, pagination, filter tabs, search, stat tile, due label, money, skeletons, error view
- [x] Landing page: nav, hero, product preview built from real components (labelled sample data), features, spotlights, how it works, privacy, FAQ, CTA, footer
- [x] Privacy, Terms, Contact pages
- [x] App shell: desktop sidebar, mobile sheet nav, user menu, quick-add menu, notification bell, skip link

## Phase 3 — Supabase, auth, migrations, RLS
- [x] Env handling (publishable key preferred, legacy anon fallback), server/browser/proxy/admin clients
- [x] `src/proxy.ts`: session refresh via `getClaims()`, protected routes, guest-only routes, no-store on private pages
- [x] Sign up (with time zone), email verification (`/auth/confirm`: token_hash + PKCE code), sign in/out, forgot/reset password, resend confirmation, safe `next` redirects
- [x] Migrations: tables, enums, constraints, indexes (incl. pg_trgm search), triggers, RLS on every table, column-level grants, RPCs, storage bucket + policies
- [x] Database types (`src/types/database.ts`)

## Phase 4 — Dashboard & core features
- [x] Dashboard: greeting/date in user TZ, today/overdue tasks (inline complete), week strip, upcoming bills & reminders (inline mark paid), month totals, recent transactions, quick add, empty states
- [x] Tasks: CRUD, statuses, priorities, categories, search/filter/sort, scope tabs with counts, list + month calendar (agenda on phones), optimistic completion + undo, pagination
- [x] Bills & reminders: CRUD, recurrence (daily/weekly/monthly/yearly), idempotent mark paid/done + undo, upcoming/overdue/history views, next occurrence, summaries
- [x] Expenses: CRUD, exact minor units, currency per row, filters + date-range presets, DB-side totals, category + trend charts with table views, pagination
- [x] Notes: autosave (serialized), save status, Ctrl/Cmd+S, beforeunload guard, flush on leave, pin, search, excerpts
- [x] Settings: profile, currency, time zone, email reminders, change password, delete account

## Phase 5 — Documents & notifications
- [x] Document vault: signed upload URL, XHR progress, client + server signature checks, randomized paths, quota, preview (images), open/download via 60 s signed URLs, delete
- [x] Notification center (bell + page), idempotent generation (per request + cron), auto-read on completion
- [x] Cron route + Resend email integration structure; `vercel.json` schedule
- [~] Email delivery — not verified: needs `RESEND_API_KEY`, `EMAIL_FROM` and a verified domain

## Phase 6 — Tests, a11y, security review
- [x] Unit tests: money, recurrence, dates/time zones, redirects, file signatures, file names
- [x] Server-action tests with a recording Supabase mock (auth, validation, ownership, money, recurrence, uploads, redirects)
- [x] Database tests on PGlite: migrations execute; RLS isolation, grants, constraints, RPC idempotency, notification dedupe, storage policies, account deletion (negative control confirmed RLS is really enforced in the harness)
- [x] Live RLS/storage integration suite (`tests/integration`) — [~] needs a Supabase test project
- [x] Playwright E2E specs: smoke (runs anywhere) + auth and feature flows — [~] flows need a Supabase test project
- [x] Accessibility pass: labels, focus states, skip links, aria-live statuses, keyboard-operable menus/dialogs, reduced motion, colour never the only signal
- [x] Responsive pass: no horizontal overflow at 320 px on public pages; phone agenda view for the calendar
- [x] Security headers (CSP, frame-ancestors, nosniff, referrer, permissions, HSTS), safe error handling

## Phase 7 — Checks & docs
- [x] README, .env.example, docs/SUPABASE_SETUP.md, docs/DEPLOYMENT.md, docs/SECURITY.md
- [x] `supabase/config.toml` (auth settings) + token_hash email templates for `supabase config push`
- [x] Final run of typecheck, lint, all tests, production build — results below

## Final verification (2026-09-30, Node 24.11, Windows)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript (strict) | `npm run typecheck` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Unit + server-action + database tests | `npm test` | ✅ 99 passed, 8 skipped (the live-Supabase suite, no test project configured) |
| — unit | `tests/unit` | 41 passed |
| — server actions | `tests/actions` | 28 passed |
| — database (PGlite, real migrations) | `tests/db` | 30 passed (plus a one-off negative control proving RLS is enforced in the harness) |
| Live RLS/storage suite | `npm run test:integration` | ⏭️ skipped — needs `TEST_SUPABASE_*` |
| Production build | `npm run build` | ✅ success; all private routes render per request |
| Production server | `npm run start` | ✅ public pages 200, unknown route 404, cron route 503 without secret, HSTS + CSP present |
| E2E smoke (no Supabase) | `npx playwright test` | ✅ 14 passed (desktop + mobile), 12 skipped (auth/feature flows need a test project) |
| E2E smoke (placeholder Supabase config) | same, desktop | ✅ 7 passed — verified the proxy's `307 → /login?next=…` redirects |
| Visual QA | Playwright screenshots at 1440 / 390 / 320 px | ✅ fixed: mobile grid overflow, toolbar wrapping, table column widths, toggle contrast, preview layout; no page-level horizontal scroll at 320 px |

## Iteration 2 — Routines & bills ⇄ available money (2026-10-01)

### Feature 1 — Recurring daily routines
- [x] Schema: `tasks.kind` (`task`/`routine`) + `repeat_days`, `starts_on`, `ends_on`, `reminder_time`, `paused_on`; `task_completions` (one row per completed date)
- [x] RLS + column grants for `task_completions`; completion validation trigger (routine only, scheduled day, not future in the user's time zone)
- [x] Routine engine (`src/lib/routines.ts`): daily / weekdays / weekends / chosen days, start/end, pause, next date, history, labels
- [x] Actions: create, edit, complete/un-complete a single date (idempotent), pause/resume, delete (history cascades)
- [x] UI: One-time task ⇄ Routine switch in the editor, Routines tab, "Today's routines" card, 7-day history strip, calendar chips (tick off today/earlier days), dashboard, quick-add
- [x] Routine reminders in the notification center (after the reminder time, once per day, not after completion)
- [x] One-time task lists/counts/notifications filter `kind = 'task'` (no regressions)

### Feature 2 — Bills integrated with expenses
- [x] `bill_occurrences.outcome` (`done`/`skipped`), `transactions.bill_occurrence_id` (unique → one expense per payment)
- [x] `mark_bill_occurrence` v2: amount actually paid, paid-on date, payment method, optional "add to expenses", skip; still idempotent and undoable (undo removes the expense)
- [x] `money_summary` RPC; `src/lib/money-overview.ts` (available now / after upcoming bills, recurring occurrences, month-end safe)
- [x] UI: bill status badges, Mark as paid dialog, Skip / Cancel, Mark as unpaid, History with Undo; Actual vs Planned panel on Expenses and Dashboard; "Bill" badge on linked expenses
- [x] Guards: bill-payment expenses can't be deleted or have amount/type changed from Expenses (app + DB trigger)

### Iteration 2 verification (executed)

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npx vitest run` | ✅ 160 passed, 10 skipped (live Supabase suite — no `TEST_SUPABASE_*`) |
| — unit (`tests/unit`) | 57 passed (16 new: routines, money overview) |
| — server actions (`tests/actions`) | 49 passed (21 new) |
| — database on PGlite (`tests/db`) | 54 passed (24 new; all 6 migrations applied in order) |
| `npm run build` | ✅ success |
| Playwright (against the running dev server) | ✅ 14 passed, 15 skipped (flows need a test project; 3 new flow specs added) |
| Visual QA 1280 / 390 / 320 px | ✅ fixed history strip overflow at 320 px and duplicate "Overdue" labels |

### Not verified (external dependencies)
- [~] New migrations are **not applied** to the Supabase Cloud project yet (`npx supabase db push` — see README). Until then the updated app shows "Could not load tasks".
- [~] Real sign-up/verification emails, full E2E flows and the live RLS suite — need a Supabase project (`TEST_SUPABASE_*`).
- [~] Email reminder delivery — needs `RESEND_API_KEY`, `EMAIL_FROM` and a verified sending domain.
- [~] Vercel deployment and cron execution — needs a Vercel project and `CRON_SECRET`.

## Iteration 3 — Email confirmation & security fixes (2026-10-02)

### Email confirmation that actually confirms
- [x] After sign-up: "Confirm your email" screen with a 3-step tracker; the account is clearly inactive until the link is opened. Resend with a 60-second cooldown, "Wrong email? Change it", tips. Notices when the link was opened in another tab and moves on.
- [x] Links land on `/verify-email`: **Email confirmed** (signed in, "Go to my dashboard"), **Email confirmed — sign in** (opened in another browser), or **This link has expired** (send a new link).
- [x] Migration `20261002000100_profiles_on_confirmation.sql`: the LifeHub profile is created on confirmation, not at sign-up (additive; not yet applied to Supabase Cloud).
- [x] Confirmation template now links to `/verify-email`.

### Security audit fixes
- [x] B1: Settings → Change password requires the current password (checked with a throwaway client), changes it through the fresh session and signs out other devices; account deletion requires the password; `/reset-password` only sets a password without the old one within 15 minutes of a reset link / sign-in.
- [x] C4: Settings → **Sign out of all devices**.
- [x] C2: documents are uploaded with `cacheControl: 0` instead of 1 hour.
- [~] Needs Supabase/Vercel settings: Secure password change, Vercel Firewall rate limits — see docs/SECURITY.md checklist.
- [ ] B2: Turnstile CAPTCHA on the auth forms (needs a Cloudflare Turnstile site key; enable Supabase CAPTCHA only after the forms send tokens).
- [ ] Deferred: nonce-based CSP (C1), locking document status/overwrites server-side (C3, needs the secret key in finalize), notification sync throttling (C5), per-account quotas (C6).

### Iteration 3 verification (executed)
| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npx vitest run` | ✅ 202 passed, 10 skipped (live Supabase suite) — unit 63, actions 80, db 59 |
| `npm run build` | ✅ success |
| Playwright smoke (desktop + mobile) | ✅ 16 passed (new: expired confirmation page) |
| Visual QA 320 px / 1280 px | ✅ `/verify-email` states, no horizontal scroll |
| Full sign-up / settings E2E flows | [~] not run — need a test Supabase project (`TEST_SUPABASE_*`) |
