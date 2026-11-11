import { Decimal, money, round2 } from "./money";
import type { PaymentStatus } from "./status";

export const PAYMENT_METHODS = ["cash", "bank_transfer", "upi", "cheque", "card_terminal", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  card_terminal: "Card (offline terminal)",
  other: "Other",
};

export interface PaymentLike {
  amount: Decimal.Value;
  refunded_amount: Decimal.Value;
  status: PaymentStatus;
}

/** Statuses whose amount was actually collected (refunds are subtracted separately). */
export const COLLECTED_STATUSES: readonly PaymentStatus[] = ["received", "partially_refunded", "refunded"];

export interface BookingBalance {
  total: Decimal;
  received: Decimal;
  refunded: Decimal;
  netCollected: Decimal;
  pending: Decimal;
  outstanding: Decimal;
}

/**
 * Outstanding = booking total - (collected - refunded). Pending and failed payments never
 * reduce the balance. Cancelled bookings have nothing outstanding.
 */
export function calculateBookingBalance(total: Decimal.Value, payments: PaymentLike[], cancelled = false): BookingBalance {
  const t = money(total);
  let received = new Decimal(0);
  let refunded = new Decimal(0);
  let pending = new Decimal(0);
  for (const p of payments) {
    if (COLLECTED_STATUSES.includes(p.status)) {
      received = received.plus(money(p.amount));
      refunded = refunded.plus(money(p.refunded_amount));
    } else if (p.status === "pending") {
      pending = pending.plus(money(p.amount));
    }
  }
  const netCollected = received.minus(refunded);
  const outstanding = cancelled ? new Decimal(0) : Decimal.max(t.minus(netCollected), 0);
  return { total: t, received, refunded, netCollected, pending, outstanding: round2(outstanding) };
}

export type PaymentValidation = { ok: true } | { ok: false; reason: string };

export function validateNewPayment(amount: Decimal.Value, status: "pending" | "received", balance: BookingBalance): PaymentValidation {
  const a = money(amount);
  if (a.lte(0)) return { ok: false, reason: "Amount must be greater than zero." };
  if (a.decimalPlaces() > 2) return { ok: false, reason: "Amount can have at most two decimal places." };
  if (status === "received" && a.gt(balance.outstanding)) {
    return { ok: false, reason: `Amount exceeds the outstanding balance of ${balance.outstanding.toFixed(2)}.` };
  }
  return { ok: true };
}

export function refundableAmount(payment: PaymentLike): Decimal {
  if (payment.status !== "received" && payment.status !== "partially_refunded") return new Decimal(0);
  return money(payment.amount).minus(money(payment.refunded_amount));
}

export function validateRefund(payment: PaymentLike, refundAmount: Decimal.Value): PaymentValidation {
  const r = money(refundAmount);
  if (r.lte(0)) return { ok: false, reason: "Refund amount must be greater than zero." };
  if (r.decimalPlaces() > 2) return { ok: false, reason: "Refund amount can have at most two decimal places." };
  const refundable = refundableAmount(payment);
  if (refundable.lte(0)) return { ok: false, reason: "This payment cannot be refunded." };
  if (r.gt(refundable)) return { ok: false, reason: `Refund exceeds the refundable amount of ${refundable.toFixed(2)}.` };
  return { ok: true };
}

/** Status a payment ends up in after a refund of the given amount. */
export function statusAfterRefund(payment: PaymentLike, refundAmount: Decimal.Value): PaymentStatus {
  const totalRefunded = money(payment.refunded_amount).plus(money(refundAmount));
  return totalRefunded.gte(money(payment.amount)) ? "refunded" : "partially_refunded";
}
