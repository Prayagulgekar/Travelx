"use client";
import Link from "next/link";
import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/format";
import { recordPaymentAction } from "@/features/payments/actions";

interface BookingOption { booking_id: string; booking_code: string; currency: string; outstanding: string; total_amount: string }

export function PaymentForm({ bookings, initialBooking, today }: { bookings: BookingOption[]; initialBooking?: string; today: string }) {
  const [idempotencyKey] = React.useState(() => crypto.randomUUID());
  const [bookingId, setBookingId] = React.useState(initialBooking ?? "");
  const [method, setMethod] = React.useState("bank_transfer");
  const selected = bookings.find((b) => b.booking_id === bookingId);
  if (bookings.length === 0) return <p className="text-sm text-muted-foreground">There are no bookings with an outstanding balance.</p>;
  return (
    <ActionForm action={recordPaymentAction} className="space-y-5">
      {({ errors }) => (
        <>
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Booking" htmlFor="booking_id" error={errors.booking_id} required className="md:col-span-2"
              hint={selected ? `Outstanding: ${formatMoney(selected.outstanding, selected.currency)} of ${formatMoney(selected.total_amount, selected.currency)}` : undefined}>
              <Select id="booking_id" name="booking_id" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
                <option value="">Select a booking</option>
                {bookings.map((b) => <option key={b.booking_id} value={b.booking_id}>{b.booking_code} · outstanding {formatMoney(b.outstanding, b.currency)}</option>)}
              </Select>
            </Field>
            <Field label={`Amount${selected ? ` (${selected.currency})` : ""}`} htmlFor="amount" error={errors.amount} required>
              <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" />
            </Field>
            <Field label="Payment date" htmlFor="payment_date" error={errors.payment_date} required>
              <Input id="payment_date" name="payment_date" type="date" max={today} defaultValue={today} />
            </Field>
            <Field label="Method" htmlFor="method" error={errors.method} required>
              <Select id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
              </Select>
            </Field>
            <Field label="Transaction reference" htmlFor="transaction_reference" error={errors.transaction_reference} required={method !== "cash"}
              hint="UTR, cheque number or terminal slip number. Used to prevent duplicate entries.">
              <Input id="transaction_reference" name="transaction_reference" />
            </Field>
            <Field label="Status" htmlFor="status" error={errors.status} hint="Pending payments are not counted as received until confirmed.">
              <Select id="status" name="status" defaultValue="received"><option value="received">Received</option><option value="pending">Pending (e.g. cheque not cleared)</option></Select>
            </Field>
            <Field label="Notes" htmlFor="notes" error={errors.notes} className="md:col-span-2"><Textarea id="notes" name="notes" rows={2} /></Field>
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">TravelX records payments collected outside the system. It does not process card payments.</p>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="outline"><Link href="/payments">Cancel</Link></Button>
            <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
