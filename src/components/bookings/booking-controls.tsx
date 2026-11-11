"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { BOOKING_TRANSITIONS, statusLabel, type BookingStatus } from "@/lib/domain/status";
import { addTravellerAction, changeBookingStatusAction, removeTravellerAction, updateBookingAction } from "@/features/bookings/actions";
import type { Booking, Traveller } from "@/types/models";

export function BookingStatusControls({ id, status, canCancel }: { id: string; status: BookingStatus; canCancel: boolean }) {
  const next = BOOKING_TRANSITIONS[status].filter((s) => s !== "cancelled");
  const cancellable = BOOKING_TRANSITIONS[status].includes("cancelled") && canCancel;
  if (next.length === 0 && !cancellable) return <p className="text-sm text-muted-foreground">This booking is {statusLabel(status).toLowerCase()}; its status is final.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s) => (
        <ConfirmAction key={s} action={changeBookingStatusAction} hidden={{ id, status: s }} title={`Mark as ${statusLabel(s).toLowerCase()}?`}
          description={s === "confirmed" ? "Confirm once suppliers have confirmed the services." : s === "in_progress" ? "The customer has started travelling." : "The trip is finished. Completed bookings become read-only."}
          confirmLabel={`Mark ${statusLabel(s).toLowerCase()}`} triggerLabel={`Mark ${statusLabel(s).toLowerCase()}`} triggerVariant="primary" testId={`booking-${s}`} />
      ))}
      {cancellable && (
        <ConfirmAction action={changeBookingStatusAction} hidden={{ id, status: "cancelled" }} title="Cancel this booking?"
          description="Cancellation cannot be undone. Received payments stay on record; record refunds separately if any are due." confirmLabel="Cancel booking" triggerLabel="Cancel booking" danger testId="booking-cancel">
          {(errors) => (
            <Field label="Cancellation reason" htmlFor="cancellation_reason" error={errors.cancellation_reason} required>
              <Textarea id="cancellation_reason" name="cancellation_reason" rows={3} />
            </Field>
          )}
        </ConfirmAction>
      )}
    </div>
  );
}

export function BookingEditForm({ booking, members, canAssign, canEditDates }: { booking: Booking; members: { value: string; label: string }[]; canAssign: boolean; canEditDates: boolean }) {
  return (
    <ActionForm action={updateBookingAction} className="space-y-4">
      {({ errors }) => (
        <>
          <input type="hidden" name="id" value={booking.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Departure" htmlFor="b-dep" error={errors.departure_date}><Input id="b-dep" name="departure_date" type="date" defaultValue={booking.departure_date} readOnly={!canEditDates} /></Field>
            <Field label="Return" htmlFor="b-ret" error={errors.return_date}><Input id="b-ret" name="return_date" type="date" defaultValue={booking.return_date} readOnly={!canEditDates} /></Field>
          </div>
          {!canEditDates && <p className="text-xs text-muted-foreground">Only owners and administrators can change dates after confirmation.</p>}
          {canAssign && (
            <Field label="Assigned agent" htmlFor="b-assign" error={errors.assigned_to}>
              <Select id="b-assign" name="assigned_to" defaultValue={booking.assigned_to ?? ""}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Booking notes" htmlFor="b-notes" error={errors.notes}><Textarea id="b-notes" name="notes" rows={3} defaultValue={booking.notes ?? ""} /></Field>
          <div className="flex justify-end"><SubmitButton size="sm">Save booking</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}

export function TravellerManager({ bookingId, travellers, editable }: { bookingId: string; travellers: Traveller[]; editable: boolean }) {
  const [adding, setAdding] = React.useState(false);
  return (
    <div className="space-y-3">
      {travellers.length === 0 ? <p className="text-sm text-muted-foreground">No traveller names recorded yet.</p> : (
        <ul className="divide-y rounded-md border">
          {travellers.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span><span className="font-medium">{t.full_name}</span> <span className="text-muted-foreground">· {statusLabel(t.traveller_type)}{t.date_of_birth ? ` · born ${t.date_of_birth}` : ""}{t.nationality ? ` · ${t.nationality}` : ""}</span></span>
              {editable && (
                <ConfirmAction action={removeTravellerAction} hidden={{ id: t.id }} title="Remove traveller?" description={`${t.full_name} will be removed from this booking.`} confirmLabel="Remove" danger triggerVariant="ghost" triggerLabel={<Trash2 className="size-4 text-danger" aria-label="Remove traveller" />} />
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (adding ? (
        <ActionForm action={addTravellerAction} resetOnSuccess className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          {({ errors }) => (
            <>
              <input type="hidden" name="booking_id" value={bookingId} />
              <Field label="Full name (as on ID)" htmlFor="t-name" error={errors.full_name} required><Input id="t-name" name="full_name" /></Field>
              <Field label="Type" htmlFor="t-type" error={errors.traveller_type}>
                <Select id="t-type" name="traveller_type" defaultValue="adult"><option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option></Select>
              </Field>
              <Field label="Date of birth" htmlFor="t-dob" error={errors.date_of_birth}><Input id="t-dob" name="date_of_birth" type="date" /></Field>
              <Field label="Nationality" htmlFor="t-nat" error={errors.nationality}><Input id="t-nat" name="nationality" /></Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Close</Button>
                <SubmitButton size="sm">Add traveller</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      ) : <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Add traveller</Button>)}
    </div>
  );
}
