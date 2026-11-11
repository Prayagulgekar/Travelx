# TravelX: delivery report

> Current status: [docs/SUPABASE_RETURN.md](docs/SUPABASE_RETURN.md) (this Supabase version, rebuilt after the Neon period, with current test results). Earlier: [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) (production-readiness review, same day). The test counts below are from the first delivery.

Date: 2026-11-01

## 1. Summary

TravelX is a multi-tenant travel agency operations app: Next.js 15, TypeScript strict, Tailwind, and Supabase (Postgres, Auth, RLS).
It covers the whole agency workflow, from customer and enquiry through quotation, acceptance, booking and payments to refunds and reports,
with Owner, Admin and Agent roles. Business rules and security are enforced in the database, so a modified client can't bypass them.
Every result below comes from commands actually run.

## 2. Features

Agencies and team invitations, dashboard, customers, enquiries, quotations (builder, decimal pricing, review and approval flow, snapshot on accept, duplicate, PDF, optional email),
itineraries (days and activities, PDF), bookings (state machine, travellers, cancellation), manual payments (overpayment guard, receipts, owner-only refunds),
reports with CSV export, global search, in-app notifications, an activity log, and a daily maintenance cron. Details are in README.md.

## 3. Technology stack

Next.js 15.5.4 (App Router, Server Actions), React 19.1, TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Tailwind 3.4, Radix UI, lucide-react,
Supabase (`@supabase/ssr`, `supabase-js`), Zod, decimal.js, pdf-lib, Vitest 3.2, Playwright 1.63, and Vercel (cron in `vercel.json`).

## 4. Architecture

See docs/ARCHITECTURE.md. In short: Server Components read data as the signed-in user, and Server Actions validate with Zod and write as the user.
RLS and triggers enforce tenancy, roles, status machines, totals and audit. The service-role key is used only for invitations and cron.

## 5. Database schema

19 tables, 5 migrations, 9 public RPCs and one view. See docs/DATABASE.md.

## 6. Authentication and security

Supabase email and password auth with cookie sessions and middleware `getUser()` validation. RLS on every table, a tenant id set by trigger,
role checks in the UI, in actions and in the database, financial totals computed only in the database, payments and audit logs that can't be deleted,
rate limiting on sensitive actions, CSV formula-injection guards, same-site redirect checks, security headers, friendly error messages (no stack traces),
and the cron endpoint protected by a timing-safe bearer secret.

## 7. Tests run and actual results

Environment: Linux, Node 22.23, PostgreSQL 16, GoTrue (Supabase Auth) v2.177.0, PostgREST v12.2.3, and Chromium (Playwright 1.63). The local stack was started fresh from the migrations.

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | **passed** (0 errors) |
| Lint | `npm run lint` | **passed** (0 warnings, 0 errors) |
| Unit tests | `npm run test:unit` | **43 passed / 43** (4 files) |
| Integration tests (real Postgres + Auth + PostgREST, real user JWTs) | `npm run test:integration` | **37 passed / 37** (3 files) |
| End-to-end (Playwright, production build) | `npm run test:e2e` | **10 passed / 10** (3 files) |
| Clean install from this zip | `npm ci` → typecheck → lint → vitest → build → e2e | **all passed** (80/80 vitest, 10/10 e2e) |

The e2e workflow test does all of the following in the browser:
- The owner logs in and sees the dashboard.
- The agent creates a customer, then an enquiry, then a quotation. The preview subtotal is 21,501.50, tax 2,020.18 and grand total 23,021.68, and the saved database total matches.
- The owner reviews, sends and accepts the quotation, then converts it to a booking.
- The owner records a ₹10,000 UPI payment. An overpayment is rejected and the outstanding balance shows 13,021.68.
- The owner confirms the booking.
- The reports page and CSV export work.
- A refund is recorded and the payment becomes partially refunded. The receipt PDF works.
- An itinerary is created and its PDF works.
- All 19 screens render without errors.
- The quotation PDF is valid.

The negative tests cover:
- invalid login
- redirects for signed-out users
- missing required fields
- a return date before departure
- agents blocked from payments and financial CSV exports (403)
- another agency's customer unreachable by URL
- self sign-up creating an isolated agency
- weak password rejection
- the invitation link → set password → agent with restricted access

A bug found by testing and fixed: the customer, enquiry, quotation (with a reason or notes dialog) and payment-refund pages crashed at runtime,
because server components passed functions to client components. It's fixed with a client `NoteForm` and a serializable `fields` prop on `ConfirmAction`, and verified by the e2e screen crawl.

## 8. Build status

`npm run build` **succeeds**. 43 routes (including icon.svg) plus middleware. Only one warning: a harmless webpack "Critical dependency" notice from `@supabase/realtime-js`.

## 9. Deployment status

**Not deployed.** No Vercel or hosted Supabase credentials were available. `vercel.json` (daily cron) and the deployment steps are in README.md.

## 10. Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`,
and optionally `RESEND_API_KEY` and `EMAIL_FROM`. See `.env.example`, which contains no secrets.

## 11. External credentials you need to provide

- A Supabase project: URL, anon key and service-role key. Apply migrations with `supabase db push`, and set the email templates and redirect URLs (README).
- A Vercel project with the env vars above.
- An SMTP provider in Supabase for production auth emails.
- Optional: a Resend API key and a verified sender for quotation emails.

## 12. Run commands

```bash
npm install
cp .env.example .env.local          # fill in Supabase values
npx supabase link --project-ref <ref> && npx supabase db push
npm run dev                         # http://localhost:3000 → /signup
npm run typecheck && npm run lint && npm run test:unit
npm run db:test-stack               # or `npx supabase start`; isolated test backend
npm run test:integration
npm run build && npm run test:e2e
```

## 13. Status breakdown

### Implemented and verified (executed tests)
Sign-up and agency creation, login and logout, invitations, role restrictions, tenant isolation (database and URL), customers, enquiries (validation and duplicate guard), quotation builder and pricing,
the quotation status workflow, the agent discount limit, the accept snapshot, conversion to booking, booking status machine and cancellation rules, payments with the overpayment guard,
refunds (owner only, caps), payment and refund delete protection, outstanding balances, the activity log, notifications, itineraries, quotation, itinerary and receipt PDFs,
reports and CSV exports (including the agent restriction), global search, the daily cron job (401 without the secret, runs with it), security headers, and the production build.

### Implemented but not verified
- Quotation **email** through Resend (code path exists; no API key, so never sent for real).
- Deployment to **Vercel** and migrations on **hosted Supabase** (tested on the equivalent open-source components locally, not on supabase.com).
- `supabase/config.toml` with `supabase start` (no Docker available).
- Password-reset email delivery (the reset page and token-hash route share code with the verified invitation flow, but no email was actually delivered).
- Mobile layout: responsive classes and a mobile nav are implemented, but no mobile-viewport e2e run was done.

### Not implemented because of missing external dependencies
- Online card or payment gateway processing (out of scope by design; payments are recorded manually).
- SMS or WhatsApp sending (no provider). Quotations are shared as PDFs and marked as sent manually.

## 14. Known issues

See docs/ARCHITECTURE.md → Known issues: in-memory rate limiting per instance, Latin-1-only PDF fonts, one agency per login, and a harmless Supabase SSR log warning.
