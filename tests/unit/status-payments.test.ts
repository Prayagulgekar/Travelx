import { describe, expect, it } from "vitest";
import { BOOKING_STATUSES, canTransitionBooking, canTransitionEnquiry, canTransitionPayment, canTransitionQuotation, manualEnquiryTransitions, QUOTATION_STATUSES } from "@/lib/domain/status";
import { calculateBookingBalance, refundableAmount, statusAfterRefund, validateNewPayment, validateRefund } from "@/lib/domain/payments";
import { assignableRoles, can, canManageMember } from "@/lib/domain/permissions";

describe("booking status transitions", () => {
  it("allows the forward workflow and cancellation before completion", () => {
    expect(canTransitionBooking("pending_confirmation", "confirmed")).toBe(true);
    expect(canTransitionBooking("confirmed", "in_progress")).toBe(true);
    expect(canTransitionBooking("in_progress", "completed")).toBe(true);
    expect(canTransitionBooking("confirmed", "cancelled")).toBe(true);
  });
  it("rejects skipping steps and changes from final states", () => {
    expect(canTransitionBooking("pending_confirmation", "completed")).toBe(false);
    expect(canTransitionBooking("pending_confirmation", "in_progress")).toBe(false);
    for (const to of BOOKING_STATUSES.filter((s) => s !== "completed")) expect(canTransitionBooking("completed", to)).toBe(false);
    for (const to of BOOKING_STATUSES.filter((s) => s !== "cancelled")) expect(canTransitionBooking("cancelled", to)).toBe(false);
  });
});

describe("quotation and enquiry transitions", () => {
  it("requires draft → reviewed → sent before accepting", () => {
    expect(canTransitionQuotation("draft", "accepted")).toBe(false);
    expect(canTransitionQuotation("draft", "sent")).toBe(false);
    expect(canTransitionQuotation("reviewed", "sent")).toBe(true);
    expect(canTransitionQuotation("sent", "accepted")).toBe(true);
    for (const to of QUOTATION_STATUSES.filter((s) => s !== "accepted")) expect(canTransitionQuotation("accepted", to)).toBe(false);
  });
  it("never offers 'converted' as a manual enquiry transition", () => {
    expect(canTransitionEnquiry("quotation_sent", "converted")).toBe(true);
    expect(manualEnquiryTransitions("quotation_sent")).not.toContain("converted");
    expect(canTransitionEnquiry("converted", "new")).toBe(false);
    expect(canTransitionEnquiry("lost", "contacted")).toBe(true);
  });
  it("only moves pending payments to received or failed", () => {
    expect(canTransitionPayment("pending", "received")).toBe(true);
    expect(canTransitionPayment("received", "pending")).toBe(false);
    expect(canTransitionPayment("received", "refunded")).toBe(false); // only through a refund
  });
});

describe("payment balance", () => {
  const payments = [
    { amount: "50000.00", refunded_amount: "0", status: "received" as const },
    { amount: "20000.00", refunded_amount: "5000.00", status: "partially_refunded" as const },
    { amount: "10000.00", refunded_amount: "0", status: "pending" as const },
    { amount: "9999.00", refunded_amount: "0", status: "failed" as const },
  ];
  it("ignores pending and failed payments and subtracts refunds", () => {
    const b = calculateBookingBalance("113696.54", payments);
    expect(b.received.toFixed(2)).toBe("70000.00");
    expect(b.refunded.toFixed(2)).toBe("5000.00");
    expect(b.netCollected.toFixed(2)).toBe("65000.00");
    expect(b.pending.toFixed(2)).toBe("10000.00");
    expect(b.outstanding.toFixed(2)).toBe("48696.54");
  });
  it("is zero for cancelled bookings and never negative", () => {
    expect(calculateBookingBalance("100", payments, true).outstanding.toFixed(2)).toBe("0.00");
    expect(calculateBookingBalance("100", payments).outstanding.toFixed(2)).toBe("0.00");
  });
  it("validates new payments against the outstanding balance", () => {
    const b = calculateBookingBalance("1000", []);
    expect(validateNewPayment("1000", "received", b).ok).toBe(true);
    expect(validateNewPayment("1000.01", "received", b).ok).toBe(false);
    expect(validateNewPayment("0", "received", b).ok).toBe(false);
    expect(validateNewPayment("-5", "received", b).ok).toBe(false);
    expect(validateNewPayment("1.001", "received", b).ok).toBe(false);
    expect(validateNewPayment("5000", "pending", b).ok).toBe(true); // pending is not capped
  });
});

describe("refund validation", () => {
  const p = { amount: "10000.00", refunded_amount: "4000.00", status: "partially_refunded" as const };
  it("limits refunds to the refundable amount", () => {
    expect(refundableAmount(p).toFixed(2)).toBe("6000.00");
    expect(validateRefund(p, "6000.00").ok).toBe(true);
    expect(validateRefund(p, "6000.01").ok).toBe(false);
    expect(validateRefund(p, "0").ok).toBe(false);
    expect(validateRefund({ ...p, status: "pending" }, "1").ok).toBe(false);
    expect(validateRefund({ ...p, status: "refunded", refunded_amount: "10000" }, "1").ok).toBe(false);
  });
  it("derives the status after a refund", () => {
    expect(statusAfterRefund(p, "1000")).toBe("partially_refunded");
    expect(statusAfterRefund(p, "6000")).toBe("refunded");
  });
});

describe("role permissions", () => {
  it("restricts finance and approvals by role", () => {
    expect(can("agent", "payments.view")).toBe(false);
    expect(can("admin", "payments.record")).toBe(true);
    expect(can("admin", "payments.refund")).toBe(false);
    expect(can("owner", "payments.refund")).toBe(true);
    expect(can("admin", "reports.financial")).toBe(false);
    expect(can("agent", "quotations.review")).toBe(false);
    expect(can(null, "reports.operational")).toBe(false);
  });
  it("limits who can manage whom", () => {
    expect(assignableRoles("admin")).toEqual(["agent"]);
    expect(assignableRoles("agent")).toEqual([]);
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("owner", "admin")).toBe(true);
  });
});
