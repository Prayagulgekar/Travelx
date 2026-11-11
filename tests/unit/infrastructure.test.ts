import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { csvCell, toCsv } from "@/lib/http";
import { hashRateLimitKey, memoryRateLimit, rateLimit, resetRateLimits, setRateLimitStore } from "@/lib/rate-limit";
import { AppError, toUserMessage } from "@/lib/errors";
import { escapeFilterValue, pageRange, safeRedirectPath } from "@/lib/utils";

describe("CSV export safety", () => {
  it("neutralises spreadsheet formulas and quotes special characters", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("a,b")).toBe("\"a,b\"");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window and resets after it", () => {
    resetRateLimits();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(memoryRateLimit("k", 3, 1000, now).allowed).toBe(true);
    const blocked = memoryRateLimit("k", 3, 1000, now + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(memoryRateLimit("k", 3, 1000, now + 1001).allowed).toBe(true);
  });

  it("can check a window without consuming it", () => {
    resetRateLimits();
    const now = 5_000_000;
    expect(memoryRateLimit("p", 2, 1000, now, false).allowed).toBe(true);
    memoryRateLimit("p", 2, 1000, now);
    memoryRateLimit("p", 2, 1000, now);
    expect(memoryRateLimit("p", 2, 1000, now + 1, false).allowed).toBe(false);
    expect(memoryRateLimit("p", 2, 1000, now + 1001, false).allowed).toBe(true);
  });

  it("hashes the subject so no email or IP is stored", () => {
    const k = hashRateLimitKey("login:1.2.3.4:a@b.com");
    expect(k).toMatch(/^login:[0-9a-f]{48}$/);
    expect(k).not.toContain("a@b.com");
    expect(hashRateLimitKey("login:1.2.3.4:a@b.com")).toBe(k);
  });

  it("uses the shared store and falls back to memory when it fails", async () => {
    resetRateLimits();
    const calls: [string, number, number][] = [];
    setRateLimitStore({ async hit(key, limit, windowSeconds) { calls.push([key, limit, windowSeconds]); return { allowed: false, retryAfterSeconds: 42 }; } });
    expect(await rateLimit("invite:user-1", 10, 3_600_000)).toEqual({ allowed: false, retryAfterSeconds: 42 });
    expect(calls[0]?.[0]).toMatch(/^invite:/);
    expect(calls[0]?.slice(1)).toEqual([10, 3600]);

    setRateLimitStore({ async hit() { throw new Error("db down"); } });
    const errSpy = console.error;
    console.error = () => {};
    try {
      expect((await rateLimit("x:1", 1, 60_000)).allowed).toBe(true);
      expect((await rateLimit("x:1", 1, 60_000)).allowed).toBe(false);
    } finally {
      console.error = errSpy;
      setRateLimitStore(undefined);
    }
  });
});

describe("safe error messages", () => {
  it("maps database errors without leaking internals", () => {
    expect(toUserMessage({ code: "23505", message: "duplicate key value violates unique constraint \"customers_phone_unique\"" })).toBe("A customer with this phone number already exists.");
    expect(toUserMessage({ code: "42501", message: "new row violates row-level security policy for table \"payments\"" })).toBe("You do not have permission to perform this action.");
    expect(toUserMessage({ code: "P0001", message: "Only draft quotations can be edited." })).toBe("Only draft quotations can be edited.");
    expect(toUserMessage({ code: "XX000", message: "internal: relation foo at line 3" })).toBe("Something went wrong. Please try again.");
    expect(toUserMessage(new Error("stack trace here"))).toBe("Something went wrong. Please try again.");
    expect(toUserMessage(new AppError("Readable"))).toBe("Readable");
  });
});

describe("request helpers", () => {
  it("prevents open redirects", () => {
    expect(safeRedirectPath("/bookings/1")).toBe("/bookings/1");
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
  });
  it("escapes PostgREST filter syntax in search terms", () => {
    expect(escapeFilterValue("a,b.c(d)")).toBe("a b c d");
    expect(escapeFilterValue("50%_off")).toBe("50\\%\\_off");
  });
  it("computes pagination ranges", () => {
    expect(pageRange(1, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(3, 20)).toEqual({ from: 40, to: 59 });
    expect(pageRange(-1, 20)).toEqual({ from: 0, to: 19 });
  });
});
