# TravelX back on Supabase: delivery report

Date: 2026-11-01. This package (`travelx-supabase.zip`) replaces the Neon + Better Auth version (`travelx-neon.zip`). It uses Supabase Postgres, Supabase Auth and Row-Level Security.

## 1. What this package is

- **It is built from the original Supabase version** (`travelx.zip`). That version was tested against Supabase's own Auth server (GoTrue) and its database API (PostgREST).
- **Fixes carried over from the Neon work** (§2) were added on top.
- **The Neon pieces are gone:** the `pg` data layer, Better Auth, Kysely, `neon/migrations`, `scripts/neon` and `scripts/local-neon`. They were never in `travelx.zip`, so nothing needed removing.
- **The database schema is `supabase/migrations/`** (6 files), unchanged and byte-identical to both earlier zips. Your new project needs no schema redesign.
- **At runtime the app talks to Supabase over HTTPS** with the project URL, the anon key and the service-role key. The database connection strings are used only by the Supabase CLI to apply migrations. They are never read by the app.

## 2. Changes compared with `travelx.zip`

| Change | Files |
|---|---|
| **Password change requires the current password.** A signed-in user at `/reset-password` must type their current password. It is checked on a separate, cookie-less client, and the temporary sign-in this creates is revoked straight away. Only a session opened from a reset or invitation link in the last hour may set a password directly. Previously, any signed-in session could change the password. | `src/lib/auth-links.ts` (new), `src/lib/supabase/server.ts`, `src/features/auth/actions.ts`, `src/app/(auth)/reset-password/page.tsx`, `src/components/auth/forms.tsx`, `src/lib/validation/misc.ts` |
| **Suspending a member also bans their login** (Supabase Auth admin API), and reactivating lifts the ban. New sign-ins and session refreshes are refused at once. RLS already hid all agency data immediately; the ban means they can no longer stay signed in on the "no access" page. | `src/features/team/actions.ts` |
| **Clearer business-rule errors.** Business-rule errors reported as duplicates now show their own message (for example "This quotation has already been converted into a booking.") instead of "This record already exists." | `src/lib/errors.ts` |
| **Read-only schema check** to run after applying the migrations. | `scripts/supabase/verify-schema.sql` (new) |
| **New tests** | `tests/unit/errors.test.ts`, `tests/unit/auth-links.test.ts`, `tests/integration/auth-sessions.test.ts`, `tests/e2e/account.spec.ts` |
| **Docs** | `.env.example` (API key note); `docs/DEPLOYMENT.md` (leave "Secure password change" off; legacy API keys); `docs/ARCHITECTURE.md`, `docs/MULTI_TENANCY.md` and `README.md` (the two auth changes) |

These were **not carried over because they only existed for Neon:** the cast fix for the raw-SQL rewrite, the date parsers, the Better Auth cookie settings, and the 7-day invitation link regression.

## 3. Tests that ran, with exact results

**Environment:** Linux, Node 22.23.4, PostgreSQL 16, Supabase Auth (GoTrue) v2.177.0, PostgREST v12.2.3 and Chromium. The stack was started fresh by `scripts/local-stack/start.sh`, and the database was created from `supabase/migrations` in order.

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | no errors |
| Lint | `npm run lint` | no warnings or errors |
| Unit | `npm run test:unit` | 62 passed / 62 (8 files) |
| Integration (real Auth + PostgREST, real user tokens) | `npm run test:integration` | 46 passed / 46 (5 files) |
| Production build | `npm run build` | compiled successfully |
| End-to-end (production build in Chromium) | `npm run test:e2e` | 18 passed / 18 |
| Schema check | `psql -f scripts/supabase/verify-schema.sql` | all 10 checks ok |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities |

**What the new tests cover:**

- Invitation and reset links count as "link sessions" for setting a password. A normal password sign-in and a sign-up confirmation link do not.
- A banned login cannot sign in or refresh its session, and it can again after the ban is lifted.
- In the browser: changing a password with the wrong current password fails and with the right one succeeds. Afterwards the old password is refused and the new one works.
- In the browser: a suspended member cannot sign in, and can again after being reactivated.

**Hosted Supabase's default grants were simulated.** Hosted Supabase automatically grants `anon` and `authenticated` access to new tables and functions in `public`. I simulated that on a separate database, applied the 6 migrations, and ran the schema check: `anon` still ends up with no table and no function privileges.

**Two things the tests surfaced** (both handled):

1. Supabase Auth records every email-link sign-in as method `otp`, not as `recovery` or `invite`. Link sessions are therefore recognised from an `otp` sign-in together with the reset or invitation time stamped on the user (`src/lib/auth-links.ts`).
2. A ban does not invalidate an access token that has already been issued. That token keeps working at the auth server until it expires, which is at most the JWT expiry (1 hour by default). RLS still blocks all data for that hour, because the membership is suspended.

## 4. What to do on your machine (your new Supabase project)

Nothing below can run from here: it needs your Supabase account. Do it in this order and stop at any step that does not look right. Never paste keys or connection strings into chat.

1. **Unzip and install.** Unzip `travelx-supabase.zip` into a new folder, then run `npm install`.
2. **Set up `.env.local`.** Copy your existing `.env.local` into the folder and compare the variable **names** with `.env.example`, without printing any values:
   ```bash
   grep -o '^[A-Z_]*=' .env.local
   ```
   The app reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000`), `CRON_SECRET`, and optionally `RESEND_API_KEY` and `EMAIL_FROM`. Use the **legacy** `anon` and `service_role` keys (Project Settings → API Keys → Legacy API keys). You can delete the Neon and Better Auth variables (`DATABASE_URL*`, `NEON_BRANCH`, `BETTER_AUTH_*`, `REQUIRE_EMAIL_VERIFICATION`); they are not read any more.
3. **Link the project (read only):**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```
   `link` asks for the database password. Type it at the prompt; it is not stored in the repository.
4. **Confirm the project is empty (read only).** In the Supabase SQL editor, run:
   ```sql
   select count(*) from information_schema.tables where table_schema in ('public', 'private');
   ```
   Expect `0`. If it is not 0, stop and tell me what is there.
5. **Status and dry run (changes nothing):**
   ```bash
   npx supabase migration list     # 6 local, 0 remote
   npx supabase db push --dry-run  # lists the 6 files it would apply
   ```
6. **Apply the schema.** This is the first step that changes the project:
   ```bash
   npx supabase db push
   npx supabase migration list     # 6 applied on both sides
   ```
   If you would rather try it on a throwaway project first, create a second Supabase project and do steps 3 to 6 there.
7. **Verify (read only).** Paste `scripts/supabase/verify-schema.sql` into the SQL editor. All 10 rows should show `ok = true`.
8. **Dashboard settings** (details in [DEPLOYMENT.md](DEPLOYMENT.md) §1 and [EMAIL.md](EMAIL.md)):
   - **Exposed schemas:** `public` only, never `private`.
   - **Site URL and Redirect URLs:** Site URL `http://localhost:3000` for now, and add `http://localhost:3000/auth/confirm` to the redirect URLs.
   - **Email templates:** set the Confirm signup, Invite user and Reset password templates to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`, as shown in the README.
   - **Password rules:** minimum password length 10, and leave **Secure password change** off.
   - **Confirm email:** your choice.
   - **SMTP:** configure custom SMTP (for example Resend) before inviting real people. The built-in sender allows only a few emails per hour.
9. **Smoke test locally.** Run `npm run dev`, open http://localhost:3000/signup, and create your agency. Then check:
   - invite an agent and open the link in a private window;
   - an agent sees only their own enquiries;
   - quotation, then booking, then payment;
   - password reset;
   - a second agency, created in another browser profile, cannot see the first one's data.
10. **Deploy (your decision).** In Vercel, replace the Neon and Better Auth variables with the Supabase ones (`docs/DEPLOYMENT.md` §2). Deploy when you decide to. Keep the Neon project untouched until you are happy with Supabase.

## 5. Existing data on Neon

Only needed if your Neon `dev` branch holds data you want to keep. If it was only used for testing, skip this section.

1. **Users.** Create each user in Supabase Auth with the **same id** through the admin API: `auth.admin.createUser({ id, email, email_confirm: true })`. The profile trigger then creates their profile row.
2. **Passwords.** Better Auth's scrypt password hashes cannot be imported, so each person sets a new password through "Forgot password".
3. **Business data.** Use `pg_dump --data-only --schema=public` from Neon, without `profiles`, plus `private.agency_counters`. Load it with triggers disabled (`set session_replication_role = replica`), into a throwaway Supabase project first. Then compare row counts table by table.

If you need this, tell me and I will prepare and test the exact scripts.

## 6. Not verified

- **Nothing has run against your hosted Supabase project.** Hosted projects run Postgres 17; testing used Postgres 16 with the same Auth and API components. Steps 5 to 7 above are the check.
- **The new `sb_publishable_…` / `sb_secret_…` key formats** have not been tested with this app. Use the legacy keys.
- **No real email was sent.** Invitation links are shown to the inviter to share, as before.
- **Server log warning.** Supabase prints a warning about `getSession()` in the server log when `/reset-password` checks the type of link session. Only the already-validated access token is read there, so this is noise, not a problem.
