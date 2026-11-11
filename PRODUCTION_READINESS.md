# TravelX: production-readiness review

Date: 2026-11-01. Scope: the full codebase and the earlier delivery report (`REPORT.md`). Working features were kept; every change below fixes
a reproduced problem or closes a gap the review asked for. Test numbers are from commands actually run, on a database rebuilt from scratch
with all 6 migrations.

## Final check results

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | **pass**, 0 errors |
| ESLint | `npm run lint` | **pass**, 0 warnings |
| Unit tests | `npm run test:unit` | **54 / 54 passed** (6 files) |
| Integration tests (real Postgres 16 + GoTrue v2.177 + PostgREST v12.2, real user JWTs) | `npm run test:integration` | **43 / 43 passed** (4 files) |
| Playwright e2e (production build, Chromium) | `npm run test:e2e` | **16 / 16 passed** (4 files), 0 server errors logged |
| Production build | `npm run build` | **pass** (Next.js 15.5.28) |
| Dependency audit, production deps | `npm audit --omit=dev` | **0 vulnerabilities** |
| Clean install from the delivered zip | `npm ci` → all of the above | **all passed** (97/97 vitest, 16/16 e2e) |

## 1. Issues found and fixed

| # | Severity | Finding | Fix | Proof |
|---|---|---|---|---|
| 1 | **Critical** | Next.js 15.5.4 is affected by published advisories, including the React Server Components RCE (GHSA-9qr9-h5gf-34mp) and middleware-bypass issues | Upgraded to Next 15.5.28 and React 19.1.10 (same minor lines) | `npm audit --omit=dev` reports 0; full suite green |
| 2 | **High** | Anyone with update rights on an accepted quotation could overwrite `accepted_snapshot`, which the booking total is copied from (a forged price) | `quotations_a_lifecycle_guard` trigger: snapshot and status timestamps can only be set by status transitions | `hardening.test.ts`: the forged snapshot is ignored and the booking total matches the real total |
| 3 | High | Booking `confirmed_at` / `cancelled_by` / `cancellation_reason` and payment `created_at` could be written directly (audit-trail forgery) | Lifecycle guard triggers on bookings and payments | `hardening.test.ts` |
| 4 | High | Zod < 4.6.6 memory-exhaustion advisory | Migrated to Zod 4.6.7 (5 validation files) | All validation tests pass |
| 5 | Medium | Users could change the email on their own profile (spoofing in team lists and logs) | Profile email is locked to the API and synced from `auth.users` | `hardening.test.ts` |
| 6 | Medium | Rate limiting was in memory per server instance | Shared Postgres limiter (`public.rate_limit_hit`, atomic upsert, service role only, hashed keys) with in-memory fallback | Unit and integration tests, plus an e2e throttling test |
| 7 | Medium | Sign-in limit counted *successful* logins (normal use could lock people out) and could be dodged by rotating IPs | Only failed attempts count, both per IP+account (8 / 10 min) and per account (20 / 15 min). Password reset is also capped per address (3 / h) with an identical response | e2e "repeated failed sign-ins are throttled" |
| 8 | Medium | Supabase auth cookies were readable by page JavaScript (`httpOnly: false` default) | httpOnly, SameSite=Lax, Secure in production; removed the unused browser Supabase client | e2e checks the cookie flags and that `document.cookie` has no token |
| 9 | Medium | Changing your password left other sessions signed in | `signOut({ scope: "others" })` after a password update | Code review (session revocation itself is Supabase's) |
| 10 | Medium | Re-inviting someone whose link expired failed with "already exists". The UI promised 24-hour links while hosted Supabase defaults to 1 hour | A pending invitee of the same agency gets a fresh one-time link; the copy now states the real expiry | e2e team spec |
| 11 | Medium | (Found while fixing #10) GoTrue returns the *existing* user for an already-invited email; a naive cleanup would delete that account | The existing-account check runs before any creation; cleanup only removes a user created in the same request | e2e: inviting another agency's user is refused and their login still works |
| 12 | Low | The invite dialog showed the previous link when reopened | Dialog state reset on Done | e2e team spec |
| 13 | Medium | PDFs used Helvetica (Latin-1): ₹, Vietnamese, Greek, Cyrillic and Devanagari names printed as `?` | Embedded subset fonts (DejaVu Sans plus Noto Sans Devanagari fallback), per-character font runs, Indian digit grouping, decimal-safe amounts; fonts traced into the serverless bundles | `tests/unit/pdf.test.ts`, visual check of a rendered quotation, build trace files list the fonts |
| 14 | Medium | Phone layout: dashboard, quotations, bookings and team pages overflowed horizontally (up to about 140 px) | Wrapping filter rows; `min-w-0` on grid columns so wide tables scroll inside their card | e2e responsive spec at 390, 820 and 1440 px |
| 15 | Medium | WCAG AA failures: warning colour contrast; scrollable tables not keyboard reachable | Darker warning token; focusable scroll containers | axe-core scan of 16 views (15 pages plus the mobile menu): 0 serious or critical |
| 16 | Low | No Content-Security-Policy | CSP: self only, plus the Supabase origin; `frame-ancestors 'none'`, `object-src 'none'`; image optimizer disabled (unused) | Header verified with curl; e2e passes under the CSP |
| 17 | Low | Middleware passed requests through when Supabase env vars were missing | Fails closed with a 503 | Code review |
| 18 | Low | Missing indexes on RLS-filtered and user FK columns; unneeded grants on `private.agency_counters` | 22 indexes (plus one for the rate-limit table); grant revoked (codes come from a definer function) | Catalog query; all tests pass |

## 2. Verified and ready

- **Tenant isolation and roles:** RLS on all 19 tables, no `anon` privileges, cross-agency reads and writes blocked (database and URL level), agents restricted to their own work, payments for owners and admins only, refunds for owners only.
- **Financial integrity:** totals computed in the database, the accepted snapshot is immutable, one booking per quotation even under **4 parallel conversions**, overpayment blocked even under **4 parallel payments**, refund caps, payments and refunds can't be deleted, revenue counts net of refunds.
- **Workflows end to end in a browser:** customer → enquiry → quotation (pricing checked) → review → send → accept → booking → payment → overpayment rejected → confirm → refund → receipt → itinerary → reports and CSV → PDFs.
- **Auth:** sign-up creates an isolated agency, invalid logins are rejected without revealing which emails exist, failed logins are throttled, invitation → set password → restricted role, re-invite, httpOnly session cookies, suspended members lose access.
- **Shared rate limiter** (Postgres), **Unicode PDFs**, **responsive layout** at phone, tablet and desktop sizes, **accessibility** (axe, WCAG 2.1 AA rules), **security headers including CSP**, **cron endpoint** (401 without the secret, runs with it).
- **No secrets in the browser bundle:** the service-role key, cron secret, Resend key and JWT secret were searched for in `.next/static` with 0 hits. `.env*` and `.localstack` are excluded from the zip and git.

## 3. Implemented but not verified

- **Real email delivery** through Resend: the request format and the "never report success on failure" behaviour are unit-tested against a mocked API, but no real send was done.
- **Hosted Supabase:** migrations ran on the same open-source components (Postgres 16, GoTrue, PostgREST), not on supabase.com. Supabase-specific settings in `docs/DEPLOYMENT.md` were not exercised.
- **Vercel:** not deployed. Cron scheduling, function regions and file tracing on Vercel's runtime are untested. The trace output was checked locally.
- **Password-reset email** (the flow shares code with the verified invitation flow; no email was delivered).
- **Signing out other sessions after a password change** (calls Supabase's API; not asserted by a multi-device test).
- `supabase/config.toml` for `supabase start` (no Docker available).
- **Browsers other than Chromium** (Firefox and Safari were not run).

## 4. Still requiring external credentials

| What | Needed for | Where |
|---|---|---|
| Supabase project URL, anon key, service-role key | Running the app; invitations, cron and the shared rate limiter need the service role | `docs/DEPLOYMENT.md` §1 |
| Vercel project and domain | Hosting and the cron job | `docs/DEPLOYMENT.md` §2 |
| SMTP provider in Supabase | Sign-up confirmation and password-reset emails | `docs/EMAIL.md` §1 |
| Resend API key and verified domain (optional) | Emailing quotation PDFs | `docs/EMAIL.md` §2 |
| `CRON_SECRET` (generate yourself) | Protecting `/api/cron/daily` | `.env.example` |

WhatsApp, SMS and payment gateways were deliberately **not** added. There are no provider credentials, and the app records payments taken outside the system.

## 5. Known risks

- **Partial Devanagari shaping:** conjuncts render, but pdf-lib skips fine mark positioning. Arabic, Tamil, Bengali and CJK print as `?`.
- **The CSP allows `'unsafe-inline'` scripts**, which Next.js needs without a nonce middleware. React escaping is the main XSS defence. No `dangerouslySetInnerHTML` is used.
- **Dates use UTC:** quotation expiry and the "departure in the past" check switch at 05:30 IST.
- **Rate-limit fallback:** if the database is unreachable, each instance limits independently (logged).
- **One agency per login** (documented; see the next section).
- **Dev-only advisories:** `npm audit` (including dev deps) lists 2 moderate issues in vitest's mocker and in minimatch under eslint. These are not shipped to production.
- **Password changes need only a valid session.** Enable Supabase's "Secure password change" so sessions older than 24 hours must re-authenticate first.

## 6. Multi-agency access

The limit is one membership per login (`agency_members.user_id` is unique). The recommended safe design is in `docs/MULTI_TENANCY.md`:
- allow many memberships;
- store the selected agency server-side (`profiles.active_agency_id`, changed only via a membership-checking `switch_agency` RPC that is logged);
- resolve `current_agency_id()` from the selection plus an active membership, so no RLS policy changes;
- don't put the agency in JWT claims, because stale claims would outlive revocation.

The workaround available today is a separate login per agency.

## 7. Recommended future improvements

1. Multi-agency memberships (design above).
2. A nonce-based CSP so `'unsafe-inline'` can be removed.
3. Agency time-zone setting, used for date rules and reports.
4. HTML-to-PDF rendering (for example a headless Chromium function) if full Indic or Arabic typography is needed.
5. Two-factor authentication (Supabase MFA, TOTP) for owners and admins.
6. Error monitoring (Sentry or similar) and uptime checks on `/login` and the cron job.
7. Firefox and WebKit in the Playwright matrix; run the integration and e2e suites in CI against `supabase start`.
8. Customer-facing quotation links (signed, expiring) instead of manual PDF sharing.
9. Data retention and export tools (GDPR/DPDP requests) and an activity-log archive.

## 8. Clean-install verification of the delivered zip

The zip was unpacked into an empty folder and run from there, against the fresh local stack:
`npm ci` OK, typecheck 0 errors, lint 0 warnings, **97/97** vitest, build OK, **16/16** Playwright, and `npm audit --omit=dev` found 0 vulnerabilities.
The only change after that run was to this report's text.
