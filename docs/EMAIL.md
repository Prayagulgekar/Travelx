# Email delivery

TravelX sends two kinds of email, and they are configured in different places.

| Email | Sent by | Configure in |
|---|---|---|
| Sign-up confirmation, password reset, email change | **Supabase Auth** | Supabase dashboard → Authentication → SMTP and Email Templates |
| Quotation PDF to a customer | **The app**, through the Resend HTTP API | `RESEND_API_KEY` and `EMAIL_FROM` environment variables |

Team invitations do **not** send an email. The inviter gets a one-time link to share, so invitations work even before SMTP is set up.

## 1. Auth emails (Supabase SMTP)

Supabase's built-in sender is for testing only. It sends only to team members of the Supabase project and is limited to a few emails per hour.
For production:

1. Pick a provider: Resend, Postmark, Amazon SES, SendGrid, or similar. With Resend, the SMTP settings are host `smtp.resend.com`, port `465`, username `resend`, and your API key as the password.
2. Verify your sending domain with the provider. Add the SPF and DKIM DNS records it gives you, and add a DMARC record (`v=DMARC1; p=none; rua=mailto:…` to start).
3. Supabase → **Authentication → SMTP Settings**: enable custom SMTP and enter the host, port, user, password, sender email (for example `no-reply@yourdomain.com`) and sender name.
4. Supabase → **Authentication → Email Templates**: change the links to the server-side token-hash flow the app expects:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   - Change email address: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`
5. Supabase → **Authentication → Rate Limits**: raise "emails sent per hour" to suit your team size.
6. Supabase → **Authentication → Providers → Email**: keep "Confirm email" on. "Email OTP expiration" also sets how long invitation links last (default 3600 s).

**Test:** use "Forgot password" on `/forgot-password` with a real inbox. The link should open `/reset-password` on your domain.

## 2. Quotation emails (Resend API)

1. Create a Resend account and verify your domain (DNS records as above).
2. Create an API key with **Sending access**, restricted to that domain.
3. Set these environment variables (in Vercel: Project → Settings → Environment Variables), then redeploy:
   - `RESEND_API_KEY=re_…`
   - `EMAIL_FROM="Your Agency <quotes@yourdomain.com>"`. The address must be on the verified domain.
4. In TravelX → **Settings**, set the agency email. It is used as the Reply-To, so customers' replies go to the agency.

**Behaviour:**
- With both variables set, reviewed or sent quotations show **Email to customer**. Sending a reviewed quotation also marks it as sent.
- The app reports success only after Resend returns a message id. Provider errors (such as "domain not verified") are shown to the user, and nothing is marked as sent.
- Each user can send at most 20 quotation emails per hour (shared rate limiter). Resend's plan limits also apply.
- With either variable missing, the button is hidden and the UI tells staff to download the PDF and share it manually.

**Verification status:** the request format, error handling and "never claim success" behaviour are covered by `tests/unit/email.test.ts` against a mocked Resend API.
A real send needs your Resend key and was **not** performed during development.
