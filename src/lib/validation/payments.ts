import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/domain/payments";
import { isoDate, moneyString, optionalText, requiredText, todayIso, uuid } from "./common";

export const paymentSchema = z.object({
  booking_id: uuid("Booking"),
  amount: moneyString("Amount", { allowZero: false }),
  method: z.enum(PAYMENT_METHODS, { error: "Choose a payment method." }),
  transaction_reference: optionalText(80),
  payment_date: isoDate("Payment date"),
  status: z.enum(["pending", "received"]),
  notes: optionalText(1000),
  idempotency_key: uuid("Submission key"),
}).superRefine((d, ctx) => {
  if (d.payment_date > todayIso(new Date(Date.now() + 86_400_000))) {
    ctx.addIssue({ code: "custom", path: ["payment_date"], message: "Payment date cannot be in the future." });
  }
  if (d.method !== "cash" && !d.transaction_reference) {
    ctx.addIssue({ code: "custom", path: ["transaction_reference"], message: "A transaction reference is required for non-cash payments." });
  }
});

export const refundSchema = z.object({
  payment_id: uuid("Payment"),
  amount: moneyString("Refund amount", { allowZero: false }),
  refund_date: isoDate("Refund date"),
  reason: requiredText("Reason", 3, 500),
  reference: optionalText(80),
});
