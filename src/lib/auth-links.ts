// Recognises sessions opened from a password-reset or invitation link (pure, so it is unit-testable).
//
// Supabase Auth records every email-link sign-in (verifyOtp with a token hash) as amr method "otp" in the
// access token, with its time. A reset or invitation link also stamps recovery_sent_at or invited_at on
// the user when it is issued. A session counts as a link session when it has an "otp" sign-in in the last
// hour from a reset or invitation link issued at most an hour before that sign-in.
// Verified against Supabase Auth in tests/integration/auth-sessions.test.ts.

export const LINK_MAX_AGE_SECONDS = 60 * 60;

interface LinkUser { id: string; recovery_sent_at?: string | null; invited_at?: string | null }

export function isPasswordLinkToken(accessToken: string, user: LinkUser, nowSeconds = Date.now() / 1000): boolean {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      sub?: string; amr?: Array<{ method?: string; timestamp?: number }>;
    };
    if (payload.sub !== user.id || !Array.isArray(payload.amr)) return false;
    const issued = [user.recovery_sent_at, user.invited_at]
      .map((v) => (v ? Date.parse(v) / 1000 : NaN))
      .filter((t) => Number.isFinite(t));
    return payload.amr.some((entry) => {
      const at = entry?.timestamp;
      if (entry?.method !== "otp" || typeof at !== "number" || nowSeconds - at > LINK_MAX_AGE_SECONDS) return false;
      // Small allowance for rounding: amr timestamps are whole seconds.
      return issued.some((t) => t <= at + 5 && at - t <= LINK_MAX_AGE_SECONDS);
    });
  } catch {
    return false;
  }
}
