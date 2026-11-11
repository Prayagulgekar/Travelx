# TravelX architecture

## Request flow

```
Browser ──► Next.js middleware (refreshes the Supabase session; redirects signed-out users to /login, returns 401 for /api/*)
        ──► Server Component page ──► src/features/<module>/queries.ts ──► Supabase as the signed-in user (RLS)
        ──► Server Action (form submit) ──► Zod validation ──► capability check ──► Supabase as the user (RLS + triggers)
        ──► Route handler (/api/*: PDFs, CSV, customer search, cron)
```

- `src/lib/auth.ts`: `requireSession()` and `requireCapability()` for pages, and `getActionContext(capability?)` for actions and routes.
  They load the user's membership (agency, role, status). Users without an active membership go to `/no-access`.
- `src/lib/domain/permissions.ts`: the role → capability matrix. It is used to hide UI and to fail early with a clear message.
  **It is not the security boundary.** The database enforces the same rules again.
- `src/features/shared.ts`: `runAction()` wraps every action. It maps database and validation errors to friendly messages (`src/lib/errors.ts`),
  logs unexpected errors on the server, and returns `ActionResult` (`ok`, `message`, `error`, `fieldErrors`, `data.redirectTo`).
- `src/components/shared/action-form.tsx`: the client form wrapper. It shows toasts and field errors, prevents double submits (pending state plus disabled button),
  and keeps the user's input when there are errors.

## Where rules live

| Rule | Enforced in |
|---|---|
| Agency isolation | RLS on every table via `private.current_agency_id()`; `agency_id` is set by an `aa_*_tenant` trigger |
| Agents see only their work | RLS (`assigned_to` / `created_by`, and derived records through the enquiry) |
| Payments: owner and admin only; refunds: owner only | RLS policies |
| Enquiry, quotation and booking status transitions | `*_before` triggers (`private.fail` with SQLSTATE codes) |
| Only draft quotations are editable; accepted ones are frozen | `quotations_before`, `quotation_items_before` |
| Quotation totals (line, tax, discount, grand total) | generated columns plus `private.quotation_compute_totals` in the trigger |
| Agent discount limit | `quotations_before` (agency `max_agent_discount_percent`) |
| Booking amount comes from the accepted snapshot | `convert_quotation_to_booking` RPC plus `bookings_before` |
| Overpayment and refund caps; payments can't be deleted | `payments_before`, `payment_refunds_before`, `*_no_delete` |
| Audit log and notifications | `*_after` triggers that call `private.log_activity` / `private.notify` (security definer) |
| Human-readable codes (CUS/ENQ/QUO/BKG/PAY-000001) | `private.agency_counters`, per agency |

The TypeScript pricing engine (`src/lib/domain/pricing.ts`) mirrors the database maths for the live preview. The saved values always come from the database.

### Pricing rules

- Line subtotal = round(quantity × unit price, 2). Line tax = round(line subtotal × tax rate / 100, 2). Rounding is half-up.
- Subtotal = Σ line subtotals; Tax = Σ line taxes.
- The discount applies to the pre-tax subtotal: either a fixed amount or round(subtotal × percent / 100, 2). It can never exceed the subtotal.
- Grand total = subtotal + tax − discount.
- Budget status: *within* if total ≤ 95% of budget, *at limit* if ≤ budget, *exceeds* if > budget, *no budget* if none is set.

### Metric definitions

- **Revenue** = received payments (status received, partially refunded or refunded) by payment date, minus refunds by refund date. Pending and failed payments never count.
- **Outstanding** = for each non-cancelled booking, max(total − (received − refunded), 0).
- **Quotation value** is pipeline value only and is never counted as revenue.

## Authentication

- Supabase Auth with email and password. Sessions are kept in HTTP-only cookies through `@supabase/ssr`. The middleware calls `getUser()`,
  which validates the token with the auth server.
- Sign-up creates the agency and the owner membership in the `handle_new_user` trigger.
- Invitations: `auth.admin.generateLink({ type: "invite" })` with the service role. The member row is inserted for the inviter's agency,
  and the one-time link is shown to the inviter to share. Opening it lets the member set a password at `/auth/confirm` and then `/reset-password`.
- Email links use the token-hash flow (`/auth/confirm?token_hash=…&type=…`), which needs the Supabase email templates in the README.
- `/reset-password` has two modes. A session opened from a reset or invitation link in the last hour (`src/lib/auth-links.ts`:
  an `otp` sign-in in the token's `amr` claim, preceded by `recovery_sent_at` or `invited_at`) may set a new password directly. Any
  other signed-in user must enter the current password, which `changePasswordAction` checks on a separate cookie-less client
  and then revokes that temporary session. Both paths sign out the user's other sessions.
- Suspending a member bans their login through the admin API (reactivating lifts it), on top of RLS hiding the agency's data.

## PDFs and email

- `src/lib/pdf`: quotation, itinerary and receipt PDFs generated with pdf-lib and embedded font subsets: DejaVu Sans for Latin (incl. extended and Vietnamese), Greek, Cyrillic and ₹/€/£, with Noto Sans Devanagari as a per-character fallback (`assets/fonts`). Characters neither font covers print as `?`. If the font files are missing, generation falls back to Helvetica (Latin-1) and logs an error.
- `src/lib/email.ts`: optional Resend integration. When `RESEND_API_KEY` is unset, the email button is hidden and the UI says to share the PDF manually.
  The app never claims an email was sent unless the provider accepted it.

## Testing strategy

- `tests/unit`: pricing, rounding, budget, status machines, payment balance maths, Zod schemas, CSV injection guard, redirect safety and the rate limiter.
- `tests/integration`: run against a real Postgres + GoTrue + PostgREST stack as real users (anon key + JWT). They cover tenant isolation, role restrictions,
  status machines, edit locks, totals, the discount limit, the accept snapshot, conversion, overpayment, refunds, delete protection, audit logs, notifications, itineraries and the daily job.
- `tests/e2e`: Playwright against `next start` and the same stack. They cover the full business workflow, negative paths (invalid login, missing fields,
  invalid dates, forbidden pages, cross-agency URLs), the invitation flow, and a render check of every screen.

## Known issues

- **Devanagari shaping is partial.** Conjuncts and vowel signs are shaped (fontkit's Indic shaper), but pdf-lib ignores GPOS mark positioning, so some stacked marks can sit slightly off. Other complex scripts (Arabic, Tamil, Bengali, CJK) are not covered by the bundled fonts and print as `?`.
- **Rate-limit fallback.** If the shared limiter (Postgres) can't be reached, each server instance falls back to its own in-memory window (logged as `[rate-limit]`).
- **Client IP** for sign-in, sign-up and reset limits comes from `x-forwarded-for`, which Vercel sets. Behind a different proxy, make sure it overwrites that header. Per-account limits apply regardless of IP.
- **Dates use the database server's time zone (UTC on Supabase).** Quotation expiry and the "departure in the past" check switch at 00:00 UTC (05:30 IST).
- **Email delivery** (Resend) is unit-tested against a mocked API only; no real email was sent during development.
- **Hosted Supabase and Vercel** were not used during development. Everything ran on PostgreSQL 16, GoTrue v2.177 and PostgREST v12.2. See [DEPLOYMENT.md](DEPLOYMENT.md).
- `supabase/config.toml` (for `supabase start`) was not exercised (no Docker in the build environment).
- The Supabase SSR library logs a harmless warning about `getSession()` during email-link verification. The app authorises with `getUser()`.
- `next build` shows a harmless webpack "Critical dependency" warning from `@supabase/realtime-js`.
- **One agency per login.** See [MULTI_TENANCY.md](MULTI_TENANCY.md) for the workaround and the recommended design.
