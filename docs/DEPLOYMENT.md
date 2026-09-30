# Deploying LifeHub to Vercel

## Prerequisites

- A Supabase Cloud project with all migrations applied ([SUPABASE_SETUP.md](./SUPABASE_SETUP.md)).
- The code in a Git repository (GitHub, GitLab or Bitbucket).

## 1. Import the project

1. <https://vercel.com/new> → import the repository.
2. **Root directory**: `lifehub` (if the repository contains the parent folder).
3. Framework preset: **Next.js** (auto-detected). Build command `npm run build`, output default.
4. Node.js version: 20.x or newer (Project Settings → General).

## 2. Environment variables

Project Settings → **Environment Variables**. Add for *Production* (and *Preview* if you use it):

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | `sb_publishable_…` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://your-domain.com` — used in auth email links |
| `NEXT_PUBLIC_CONTACT_EMAIL` | no | shown on /contact and /privacy |
| `SUPABASE_SECRET_KEY` | for reminders | `sb_secret_…` — server only; used by the cron route |
| `CRON_SECRET` | for reminders | random string, e.g. `openssl rand -hex 32` |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email reminders | leave empty to keep reminders in-app only |

`NEXT_PUBLIC_*` values are embedded at **build** time — redeploy after changing them.

## 3. Deploy

Click **Deploy**. When it finishes, open the URL and check:

- the landing page loads;
- `/dashboard` redirects to `/login`;
- sign-up sends a confirmation email and the link lands on `/dashboard`.

## 4. Point Supabase Auth at the deployment

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL** = your production URL.
- **Redirect URLs** include `https://<your-domain>/**` (and preview URLs if needed).

Then update the email templates as described in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md#5-authentication-settings).

## 5. Scheduled reminders (optional)

`vercel.json` schedules `GET /api/cron/reminders` daily at 22:00 UTC (06:00 in Manila). Vercel
automatically sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set.

The job:

1. generates due/overdue notifications for all users (idempotent — safe to re-run);
2. if `RESEND_API_KEY` and `EMAIL_FROM` are set, emails a digest to users who enabled
   **Email reminders** in Settings, marking each notification as emailed so it is never sent twice.

Without `SUPABASE_SECRET_KEY` + `CRON_SECRET` the route returns `503` and nothing runs; in-app
notifications still appear because each user's notifications are also generated when they open
the app.

Test it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/reminders
# {"generated":0,"emailed":0,"email":"not configured"}
```

> Email delivery has **not** been verified in this repository because no email provider was
> configured. Send yourself a test digest before relying on it: verify your sending domain in
> Resend, set the variables, enable Email reminders for your account, create a bill due today, and
> call the endpoint.

Vercel Hobby plans allow daily cron jobs; for more frequent runs use a Pro plan or an external
scheduler (e.g. Supabase `pg_cron` + `pg_net` calling the same URL with the bearer token).

## 6. Custom domain

Project Settings → Domains → add your domain, then update `NEXT_PUBLIC_SITE_URL` and the
Supabase Site URL / Redirect URLs to match, and redeploy.

## Production build locally

```bash
npm run build
npm run start   # serves the production build on http://localhost:3000
```
