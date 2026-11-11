import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptedBooking, admin, createAgency, createCustomer, createEnquiry, createQuotation, setQuotationStatus, stackAvailable, type TestAgency,
} from "./helpers";

// Regression tests for issues found in the production-readiness review.
describe.skipIf(!stackAvailable)("production-readiness hardening", () => {
  let t: TestAgency;
  beforeAll(async () => { t = await createAgency("Hard"); });

  it("the accepted price snapshot cannot be forged before conversion", async () => {
    const c = await createCustomer(t.agent);
    const e = await createEnquiry(t.agent, c.id);
    const qid = await createQuotation(t.agent, e.id);
    for (const s of ["reviewed", "sent", "accepted"]) expect((await setQuotationStatus(t.owner, qid, s)).error).toBeNull();
    const { data: before } = await t.agent.from("quotations").select("grand_total, accepted_snapshot, accepted_at").eq("id", qid).single();
    const forged = { ...(before!.accepted_snapshot as Record<string, unknown>), quotation: { grand_total: "1.00" } };
    await t.agent.from("quotations").update({ accepted_snapshot: forged, accepted_at: "2000-01-01T00:00:00Z" }).eq("id", qid);
    const { data: after } = await t.agent.from("quotations").select("accepted_snapshot, accepted_at").eq("id", qid).single();
    expect(after!.accepted_snapshot).toEqual(before!.accepted_snapshot);
    expect(after!.accepted_at).toBe(before!.accepted_at);
    const { data: bid, error } = await t.agent.rpc("convert_quotation_to_booking", { p_quotation_id: qid, p_notes: null });
    expect(error).toBeNull();
    const { data: b } = await t.agent.from("bookings").select("total_amount").eq("id", bid as string).single();
    expect(b!.total_amount).toBe(before!.grand_total);
  });

  it("booking lifecycle timestamps cannot be forged", async () => {
    const c = await createCustomer(t.agent);
    const e = await createEnquiry(t.agent, c.id);
    const { bookingId } = await acceptedBooking(t, e.id);
    await t.agent.from("bookings").update({ confirmed_at: "2000-01-01T00:00:00Z", cancelled_by: t.agentId, cancellation_reason: "fake" }).eq("id", bookingId);
    const { data } = await t.owner.from("bookings").select("confirmed_at, cancelled_by, cancellation_reason, status").eq("id", bookingId).single();
    expect(data).toMatchObject({ confirmed_at: null, cancelled_by: null, cancellation_reason: null, status: "pending_confirmation" });
  });

  it("users cannot change the email stored on their profile", async () => {
    await t.agent.from("profiles").update({ email: "ceo@spoofed.example", full_name: "Agent Renamed" }).eq("id", t.agentId);
    const { data } = await admin().from("profiles").select("email, full_name").eq("id", t.agentId).single();
    expect(data!.email).not.toBe("ceo@spoofed.example");
    expect(data!.full_name).toBe("Agent Renamed");
  });

  it("the shared rate limiter counts across calls and is service-role only", async () => {
    const key = `test:${Date.now()}`;
    const hit = async () => (await admin().rpc("rate_limit_hit", { p_key: key, p_limit: 2, p_window_seconds: 60 })).data as { allowed: boolean; retry_after_seconds: number }[];
    expect((await hit())[0]!.allowed).toBe(true);
    expect((await hit())[0]!.allowed).toBe(true);
    const third = (await hit())[0]!;
    expect(third.allowed).toBe(false);
    expect(third.retry_after_seconds).toBeGreaterThan(0);
    const peek = (await admin().rpc("rate_limit_hit", { p_key: key, p_limit: 5, p_window_seconds: 60, p_consume: false })).data as { allowed: boolean }[];
    expect(peek[0]!.allowed).toBe(true); // 3 hits < 5, and peeking does not count
    const peekBlocked = (await admin().rpc("rate_limit_hit", { p_key: key, p_limit: 3, p_window_seconds: 60, p_consume: false })).data as { allowed: boolean }[];
    expect(peekBlocked[0]!.allowed).toBe(false);
    const asUser = await t.agent.rpc("rate_limit_hit", { p_key: key, p_limit: 100, p_window_seconds: 60 });
    expect(asUser.error).not.toBeNull();
  });

  it("parallel conversions of one quotation create exactly one booking", async () => {
    const c = await createCustomer(t.agent);
    const e = await createEnquiry(t.agent, c.id);
    const qid = await createQuotation(t.agent, e.id);
    for (const st of ["reviewed", "sent", "accepted"]) expect((await setQuotationStatus(t.owner, qid, st)).error).toBeNull();
    const results = await Promise.all([t.agent, t.owner, t.admin, t.agent].map((cl) => cl.rpc("convert_quotation_to_booking", { p_quotation_id: qid, p_notes: null })));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    const { count } = await admin().from("bookings").select("id", { count: "exact", head: true }).eq("quotation_id", qid);
    expect(count).toBe(1);
  });

  it("parallel payments cannot together exceed the booking total", async () => {
    const c = await createCustomer(t.agent);
    const e = await createEnquiry(t.agent, c.id);
    const { bookingId } = await acceptedBooking(t, e.id);
    const { data: b } = await t.owner.from("bookings").select("total_amount").eq("id", bookingId).single();
    const total = Number(b!.total_amount);
    const part = (total * 0.6).toFixed(2); // any two of these exceed the total
    const results = await Promise.all([t.owner, t.admin, t.owner, t.admin].map((cl) => cl.from("payments").insert({
      booking_id: bookingId, amount: part, method: "cash", payment_date: new Date().toISOString().slice(0, 10), status: "received",
      idempotency_key: randomUUID(), customer_id: c.id, currency: "INR",
    }).select("id")));
    if (results.every((r) => r.error)) console.log(results.map((r) => r.error?.message));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    const { data: rows } = await admin().from("payments").select("amount").eq("booking_id", bookingId);
    expect(rows!.reduce((sum, r) => sum + Number(r.amount), 0)).toBeLessThanOrEqual(total);
  });
});

