# Deploying TravelX (hosted Supabase + Vercel)

Use **separate Supabase projects** for production and for previews or staging. Never run the integration or e2e tests against production:
they create users and agencies.

## 1. Supabase project

1. Create a project at supabase.com. Choose the region closest to your users (for India, `ap-south-1` Mumbai) and save the database password.
2. Apply the schema from your machine:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push        # applies supabase/migrations/2026110100010…0600 in order
   ```
   The migrations create a trigger on `auth.users` (profile and agency bootstrap) and a `private` schema. Both are supported on hosted Supabase.
3. **API exposure** (Project Settings → API): keep **Exposed schemas** set to `public` (and `graphql_public`). Do **not** expose `private`.
4. **GraphQL:** the app doesn't use `pg_graphql`. You can disable it (Database → Extensions → `pg_graphql`) to reduce attack surface. RLS and grants apply either way.
5. **Authentication settings:**
   - URL Configuration: set Site URL to `https://<your-domain>`, and add `https://<your-domain>/auth/confirm` to Redirect URLs (plus your preview domain if needed).
   - Providers → Email: keep Confirm email on. Set **Minimum password length** to 10 to match the app. Turn on leaked-password protection if your plan includes it.
   - Turn on **Secure email change**.
   - Leave **Secure password change** off. TravelX already asks for the current password before a signed-in password change (and reset/invitation links are handled separately). With that setting on, Supabase would also demand an emailed reauthentication code, which the app does not ask for, so password changes on sessions older than 24 hours would fail.
   - Email Templates and SMTP: see [EMAIL.md](EMAIL.md).
   - Sign-ups: TravelX lets anyone create a new agency from `/signup`. If you only serve your own agency, create the owner account first and then disable **Allow new users to sign up**. Invitations still work because they use the service role.
6. **Keys** (Project Settings → API Keys): copy the Project URL, the `anon` key and the `service_role` key (on newer projects they are under the **Legacy API keys** tab). The service-role key goes **only** into server-side environment variables. The app was tested with these JWT-style keys; the newer `sb_publishable_…` / `sb_secret_…` keys have not been tested with it.
7. **Backups:** enable Point-in-Time Recovery on paid plans, or at least confirm daily backups. Payments and refunds can't be deleted in the app, so backups are the recovery path for operator error.

## 2. Vercel project

1. Push the code to a Git repository and import it in Vercel (framework preset: Next.js, Node.js 20 or 22).
2. Set **Project → Settings → Functions → Region** to the same region as Supabase (for example `bom1` for Mumbai). This removes cross-region latency on every query.
3. Add the environment variables, with separate values for Production and Preview:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role key (not exposed to the browser; only read by server code) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>`, no trailing slash |
   | `CRON_SECRET` | 32+ random characters, e.g. `openssl rand -hex 32` |
   | `RESEND_API_KEY`, `EMAIL_FROM` | optional, see [EMAIL.md](EMAIL.md) |

   `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing them.
4. Deploy. `vercel.json` registers `/api/cron/daily` at 00:30 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. The endpoint returns 401 without it.
   On the Hobby plan, daily cron jobs may run at any time within the scheduled hour.
5. Add your custom domain, then update the Supabase Site URL and redirect URLs to match.

## 3. What the app needs at runtime

- **Fonts for PDFs** are read from `assets/fonts` and bundled with the PDF routes through `outputFileTracingIncludes` in `next.config.ts`. This was verified in the build's trace files.
  If they were ever missing, PDFs still generate with Helvetica (Latin-1 only), and the server logs `[pdf] embedded fonts unavailable`.
- **Rate limiting** uses the `public.rate_limit_hit` database function with the service-role key, so the counters are shared across all Vercel instances.
  Without `SUPABASE_SERVICE_ROLE_KEY` it falls back to per-instance memory and logs a warning.
- **Security headers** (CSP, HSTS, frame denial, nosniff, referrer policy) come from `next.config.ts`. The CSP allows connections only to the site itself and the Supabase project origin.

## 4. Post-deploy smoke test (about 10 minutes)

1. `/signup` creates the agency and you land on the dashboard. If email confirmation is on, the email arrives and its link signs you in.
2. Team → Invite member → open the link in a private window → set a password → you land as that role.
3. Create a customer, an enquiry and a quotation → review → mark sent → download the PDF and check names and ₹ render → accept → convert to booking.
4. Record a payment, record a refund (owner), and download the receipt.
5. Reports → CSV export downloads.
6. `curl -i https://<domain>/api/cron/daily` returns 401. In Vercel → Cron Jobs, run it manually; it should return `{"ok":true,...}`.
7. Forgot password → the email arrives → reset works and other sessions are signed out.

## 5. Operations

- **Logs:** Vercel → Logs for server errors (logged with a context label; users only see friendly messages). Supabase → Logs for Postgres and Auth.
- **Migrations:** add new files to `supabase/migrations` and run `npx supabase db push` against staging first, then production.
- **Key rotation:** rotating the service-role or JWT secret in Supabase requires updating the Vercel env vars and redeploying.
