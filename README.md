# TravelX

TravelX is an internal operations app for travel agencies. Staff use it to manage customers, enquiries,
quotations, itineraries, bookings and manually recorded payments, with role-based access and an audit trail.
It is not a consumer booking site and it does not process card payments.

## Features

- **Agencies and teams.** A sign-up creates an agency workspace and makes that person its owner. Owners and admins invite members with one-time links. Roles are Owner, Admin and Agent.
- **Dashboard.** Enquiry, quotation, booking and trip counts. Owners and admins also see revenue, outstanding and pending figures. A 6-month chart.
- **Customers.** CRUD, duplicate phone and email warnings, notes, archive, and history across their enquiries, quotations, bookings and payments.
- **Enquiries.** Validated travel requests (dates, travellers, budget), assignment, priority, a status workflow with reasons, notes, a duplicate guard and double-submit protection.
- **Quotations.** A line-item builder with a decimal-safe pricing engine. Tax is per line and discounts are fixed or percent, with an approval limit for agents. A budget indicator. Draft → Reviewed → Sent → Accepted / Rejected / Expired. Only drafts are editable. A price snapshot is frozen on acceptance. Duplicate, PDF export, and optional email.
- **Itineraries.** Day-by-day plans with ordered activities, linked to an enquiry or booking, with PDF export.
- **Bookings.** Created only from an accepted quotation's snapshot. Status machine: Pending → Confirmed → In progress → Completed, or Cancelled with a reason. Travellers, notes and a full audit trail.
- **Payments.** Manual records (cash, UPI, bank transfer, card terminal, cheque, other) with overpayment prevention, duplicate-reference protection, pending versus received status, owner-only refunds with caps, PDF receipts, and outstanding balances.
- **Reports.** Enquiry funnel, quotation outcomes, booking status, top destinations, cancellations, collections by method, outstanding balances and employee performance, each with CSV export. Financial sections are visible to owners only.
- **Global search**, **in-app notifications** (assignments, status changes, payments, upcoming trips), and an **activity log** on every record.
- **Daily maintenance job** (`/api/cron/daily`). It expires overdue quotations and sends notifications for trips departing in the next 3 days.

## Tech stack

Next.js 15 (App Router, Server Components, Server Actions), TypeScript (strict), Tailwind CSS, Radix primitives (shadcn-style components),
Lucide icons, Supabase (Postgres, Auth, Row-Level Security), Zod, decimal.js, pdf-lib, Vitest, Playwright, and Vercel.

## Architecture (short)

- The **database is the source of truth for rules.** RLS isolates agencies and restricts agents to their own work. Triggers enforce status machines,
  edit locks, totals computation, discount limits, overpayment and refund caps, audit logging and notifications. The server never trusts totals sent by the browser.
- **Server Actions** validate input with Zod, check role capabilities for clear error messages, and then call Supabase *as the signed-in user* so that RLS applies.
  The service-role key is used only for invitations and the cron job.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATABASE.md](docs/DATABASE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (Vercel and hosted Supabase),
  [docs/EMAIL.md](docs/EMAIL.md) (real email delivery) and [docs/MULTI_TENANCY.md](docs/MULTI_TENANCY.md) (multi-agency access).

```
src/app            routes: (auth) pages, (app) pages, api/* route handlers
src/features/*     per-module server queries and server actions
src/components/*   UI (ui primitives, shared, per module)
src/lib            env, supabase clients, auth/permissions, domain logic (money, pricing, status, payments), validation, pdf, csv
supabase/migrations  schema, logic (triggers/RPC), RLS, reporting, quotation RPC
tests/unit | tests/integration | tests/e2e
scripts/local-stack  Docker-free Supabase-compatible stack used for integration/e2e tests
```

> **New here? Step-by-step for VS Code on Windows or Mac:** [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)
>
> **Coming from the Neon + Better Auth version?** Follow [docs/SUPABASE_RETURN.md](docs/SUPABASE_RETURN.md) §4.

## Prerequisites

- Node.js 20.9 or newer, and npm
- A Supabase project (hosted), **or** the Supabase CLI with Docker for local development
- Optional: a Resend account if you want quotation emails

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values (see below)
```

### Environment variables

| Variable | Required | Where it is used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | browser and server (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes for invitations and cron | server only (`src/lib/supabase/admin.ts`) |
| `NEXT_PUBLIC_SITE_URL` | yes in production | links in auth emails |
| `CRON_SECRET` | yes for the daily job | `/api/cron/daily` bearer token |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | quotation emails; the email button is hidden when unset |

### Database (Supabase)

Apply the migrations in `supabase/migrations` in order:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

(Alternatively, paste each migration file into the SQL editor in filename order.)

Then in the Supabase dashboard:

1. **Authentication → URL Configuration.** Set the Site URL to your app URL and add `<SITE_URL>/auth/confirm` to the redirect URLs.
2. **Authentication → Email Templates.** Make the links use the server-side token-hash flow:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   - Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
3. **Authentication → SMTP.** Configure a real SMTP provider for production. Supabase's built-in sender is heavily rate-limited. See [docs/EMAIL.md](docs/EMAIL.md).

If email confirmation is turned off, sign-up logs the user straight in.

### Run locally

```bash
npm run dev          # http://localhost:3000
```

Open `/signup` to create your agency (you become the Owner). Then invite your team from **Team**. An invitation produces a one-time
link that you share with the member, who sets a password from it.

## Testing

```bash
npm run typecheck
npm run lint
npm run test:unit                 # pure logic: pricing, status machines, payments, validation, CSV/redirect safety
```

Integration and end-to-end tests need an **isolated** local Supabase-compatible backend. They create throw-away agencies.
**Never point them at production.**

Option A: Supabase CLI with Docker:

```bash
npx supabase start               # applies supabase/migrations
# then create .localstack/env with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# TEST_DATABASE_URL (postgresql://postgres:postgres@127.0.0.1:54322/postgres) from `npx supabase status`
```

Option B: the Docker-free stack in `scripts/local-stack` (Postgres 15/16, the GoTrue binary and the PostgREST binary on the machine):

```bash
PG_BIN=/usr/lib/postgresql/16/bin GOTRUE_BIN=/path/to/auth POSTGREST_BIN=/path/to/postgrest npm run db:test-stack
# writes .localstack/env; stop with: bash scripts/local-stack/stop.sh
```

Then:

```bash
npm run test:integration          # RLS, tenant isolation, triggers, workflow, refunds, maintenance job
cp .localstack/env .env.local     # point the app at the test stack
npm run build
npm run test:e2e                  # starts `next start` on :3100 and drives Chromium
```

## Deployment (Vercel)

1. Push the repository to GitHub and import it in Vercel (framework: Next.js).
2. Add the environment variables above in Vercel, with `NEXT_PUBLIC_SITE_URL` set to the production URL.
3. Deploy. `vercel.json` registers the daily cron (`/api/cron/daily`, 00:30 UTC). Vercel sends `CRON_SECRET` as the bearer token automatically.
4. Update the Supabase Site URL and redirect URLs to the production domain.

The full checklist (Supabase auth settings, region, backups, the post-deploy smoke test) is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security notes

- Every table has RLS. Tenant `agency_id` is set by a trigger from the caller's membership and cannot be supplied by the client.
- Financial totals, booking amounts and balances are computed in the database.
- The service-role key is only imported from `server-only` modules.
- Errors shown to users are mapped to friendly messages. Internal errors are logged on the server only.
- Sign-in (per IP and per account), sign-up, password reset (per IP and per address), invitations, payment recording and quotation emails are rate-limited.
  The counters live in Postgres (`public.rate_limit_hit`, service role only), so all server instances share them. Keys are hashed.
- Session cookies are httpOnly, SameSite=Lax and Secure in production. Changing your password requires your current password (reset and invitation links excepted) and signs out your other sessions. Suspending a member also blocks their sign-in until they are reactivated.
- CSV exports neutralise spreadsheet formula injection. Redirect targets are restricted to same-site paths.

## Known limitations

See "Known issues" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#known-issues).
