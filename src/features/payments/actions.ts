"use server";
import { getActionContext } from "@/lib/auth";
import { AppError, type ActionResult } from "@/lib/errors";
import { paymentSchema, refundSchema } from "@/lib/validation/payments";
import { uuid } from "@/lib/validation/common";
import { calculateBookingBalance, validateNewPayment, validateRefund, type PaymentLike } from "@/lib/domain/payments";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionPayload } from "@/components/shared/action-form";
import { nullable, parseForm, runAction, unwrap } from "../shared";

type R = ActionResult<ActionPayload>;

export async function recordPaymentAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("payments.record", async () => {
    const ctx = await getActionContext("payments.record");
    if (!(await rateLimit(`payment:${ctx.userId}`, 30, 60_000)).allowed) throw new AppError("Too many payment entries in a short time. Please wait a minute.", 429);
    const input = parseForm(paymentSchema, formData);

    const prior = await ctx.supabase.from("payments").select("id").eq("idempotency_key", input.idempotency_key).maybeSingle();
    if (prior.data) return { ok: true, message: "This payment was already recorded.", data: { redirectTo: `/payments/${prior.data.id}` } };

    const booking = unwrap(await ctx.supabase.from("bookings").select("id, total_amount, status").eq("id", input.booking_id).single()) as { id: string; total_amount: string; status: string };
    const payments = unwrap(await ctx.supabase.from("payments").select("amount, refunded_amount, status").eq("booking_id", booking.id)) as PaymentLike[];
    const balance = calculateBookingBalance(booking.total_amount, payments, booking.status === "cancelled");
    if (booking.status === "cancelled") throw new AppError("Payments cannot be recorded against a cancelled booking.");
    const check = validateNewPayment(input.amount, input.status, balance);
    if (!check.ok) throw new AppError(check.reason, 422, { amount: check.reason });

    const res = await ctx.supabase.from("payments").insert({
      booking_id: input.booking_id, amount: input.amount, method: input.method, transaction_reference: nullable(input.transaction_reference),
      payment_date: input.payment_date, status: input.status, notes: nullable(input.notes), idempotency_key: input.idempotency_key,
      customer_id: "00000000-0000-0000-0000-000000000000", currency: "XXX", // overwritten from the booking by the database
    }).select("id").single();
    if (res.error?.code === "23505" && /idempotency/.test(res.error.message)) {
      return { ok: true, message: "This payment was already recorded.", data: { redirectTo: "/payments" } };
    }
    const created = unwrap(res) as { id: string };
    return { ok: true, message: input.status === "received" ? "Payment recorded as received." : "Payment recorded as pending.", data: { redirectTo: `/payments/${created.id}` } };
  });
}

export async function updatePaymentStatusAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("payments.status", async () => {
    const ctx = await getActionContext("payments.record");
    const id = uuid("Payment").parse(formData.get("id"));
    const status = String(formData.get("status"));
    if (status !== "received" && status !== "failed") throw new AppError("A pending payment can only be marked received or failed.");
    const rows = unwrap(await ctx.supabase.from("payments").update({ status }).eq("id", id).eq("status", "pending").select("id"));
    if (rows.length === 0) throw new AppError("Only pending payments can be updated.");
    return { ok: true, message: status === "received" ? "Payment marked as received." : "Payment marked as failed." };
  });
}

export async function recordRefundAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("payments.refund", async () => {
    const ctx = await getActionContext("payments.refund");
    const input = parseForm(refundSchema, formData);
    const payment = unwrap(await ctx.supabase.from("payments").select("amount, refunded_amount, status, payment_date").eq("id", input.payment_id).single()) as PaymentLike & { payment_date: string };
    const check = validateRefund(payment, input.amount);
    if (!check.ok) throw new AppError(check.reason, 422, { amount: check.reason });
    if (input.refund_date < payment.payment_date) throw new AppError("Refund date cannot be before the payment date.", 422, { refund_date: "Before the payment date." });
    unwrap(await ctx.supabase.from("payment_refunds").insert({
      payment_id: input.payment_id, amount: input.amount, refund_date: input.refund_date, reason: input.reason, reference: nullable(input.reference),
    }));
    return { ok: true, message: "Refund recorded." };
  });
}
