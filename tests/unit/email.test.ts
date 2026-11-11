import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, getEmailProvider, isEmailConfigured } from "@/lib/email";

describe("email provider (Resend)", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("is disabled unless both RESEND_API_KEY and EMAIL_FROM are set", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "TravelX <quotes@example.com>");
    expect(isEmailConfigured()).toBe(false);
    expect(getEmailProvider()).toBeNull();
  });

  it("sends the documented Resend payload and reports the provider id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Agency <quotes@example.com>");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await getEmailProvider()!.send({ to: "c@example.com", subject: "Quote", html: "<p>x</p>", text: "x", replyTo: "a@example.com", attachments: [{ filename: "Q.pdf", content: new Uint8Array([37, 80, 68, 70]) }] });
    expect(res).toEqual({ ok: true, providerId: "email_123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: "Agency <quotes@example.com>", to: ["c@example.com"], subject: "Quote", reply_to: "a@example.com" });
    expect(body.attachments[0]).toEqual({ filename: "Q.pdf", content: Buffer.from("%PDF").toString("base64") });
  });

  it("never reports success when the provider rejects or is unreachable", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "quotes@example.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "The domain is not verified" }), { status: 403 })));
    expect(await getEmailProvider()!.send({ to: "c@example.com", subject: "s", html: "h", text: "t" })).toEqual({ ok: false, error: "The domain is not verified" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await getEmailProvider()!.send({ to: "c@example.com", subject: "s", html: "h", text: "t" })).toEqual({ ok: false, error: "The email provider could not be reached." });
  });

  it("escapes customer-supplied text in the HTML body", () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
  });
});
