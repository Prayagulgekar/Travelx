import { describe, expect, it } from "vitest";
import { isPasswordLinkToken } from "@/lib/auth-links";

const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
const NOW = 1_800_000_000;
const iso = (s: number) => new Date(s * 1000).toISOString();
const user = { id: "u1", recovery_sent_at: iso(NOW - 120), invited_at: null };

describe("isPasswordLinkToken", () => {
  it("accepts a recent link sign-in that follows a reset link", () => {
    expect(isPasswordLinkToken(token({ sub: "u1", amr: [{ method: "otp", timestamp: NOW - 60 }] }), user, NOW)).toBe(true);
  });
  it("rejects password sign-ins", () => {
    expect(isPasswordLinkToken(token({ sub: "u1", amr: [{ method: "password", timestamp: NOW - 60 }] }), user, NOW)).toBe(false);
  });
  it("rejects link sign-ins older than an hour", () => {
    expect(isPasswordLinkToken(token({ sub: "u1", amr: [{ method: "otp", timestamp: NOW - 3700 }] }), { ...user, recovery_sent_at: iso(NOW - 3800) }, NOW)).toBe(false);
  });
  it("rejects link sign-ins with no reset or invitation issued shortly before (e.g. sign-up confirmation)", () => {
    expect(isPasswordLinkToken(token({ sub: "u1", amr: [{ method: "otp", timestamp: NOW - 60 }] }), { id: "u1", recovery_sent_at: null, invited_at: null }, NOW)).toBe(false);
    expect(isPasswordLinkToken(token({ sub: "u1", amr: [{ method: "otp", timestamp: NOW - 60 }] }), { id: "u1", recovery_sent_at: iso(NOW - 2 * 86400) }, NOW)).toBe(false);
  });
  it("rejects a token for another user and malformed tokens", () => {
    expect(isPasswordLinkToken(token({ sub: "u2", amr: [{ method: "otp", timestamp: NOW - 60 }] }), user, NOW)).toBe(false);
    expect(isPasswordLinkToken("garbage", user, NOW)).toBe(false);
  });
});
