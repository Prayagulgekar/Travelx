"use client";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton, type FormAction } from "@/components/shared/action-form";
import type { Itinerary } from "@/types/models";

interface Opt { value: string; label: string }

export function ItineraryForm({ action, itinerary, defaults, enquiries, quotations, bookings }: {
  action: FormAction; itinerary?: Itinerary;
  defaults?: Partial<Pick<Itinerary, "name" | "destination" | "start_date" | "end_date" | "enquiry_id" | "quotation_id" | "booking_id">>;
  enquiries: Opt[]; quotations: Opt[]; bookings: Opt[];
}) {
  const v = { ...defaults, ...itinerary };
  return (
    <ActionForm action={action} className="space-y-5">
      {({ errors }) => (
        <>
          {itinerary && <input type="hidden" name="id" value={itinerary.id} />}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Itinerary name" htmlFor="name" error={errors.name} required className="md:col-span-2"><Input id="name" name="name" defaultValue={v.name ?? ""} /></Field>
            <Field label="Destination" htmlFor="destination" error={errors.destination} required><Input id="destination" name="destination" defaultValue={v.destination ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date" htmlFor="start_date" error={errors.start_date} required><Input id="start_date" name="start_date" type="date" defaultValue={v.start_date ?? ""} /></Field>
              <Field label="End date" htmlFor="end_date" error={errors.end_date} required><Input id="end_date" name="end_date" type="date" defaultValue={v.end_date ?? ""} /></Field>
            </div>
            <Field label="Related enquiry" htmlFor="enquiry_id" error={errors.enquiry_id}>
              <Select id="enquiry_id" name="enquiry_id" defaultValue={v.enquiry_id ?? ""}><option value="">None</option>{enquiries.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Related quotation" htmlFor="quotation_id" error={errors.quotation_id}>
              <Select id="quotation_id" name="quotation_id" defaultValue={v.quotation_id ?? ""}><option value="">None</option>{quotations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Related booking" htmlFor="booking_id" error={errors.booking_id}>
              <Select id="booking_id" name="booking_id" defaultValue={v.booking_id ?? ""}><option value="">None</option>{bookings.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Overview" htmlFor="notes" error={errors.notes} className="md:col-span-2" hint="Shown at the top of the itinerary PDF."><Textarea id="notes" name="notes" rows={3} defaultValue={itinerary?.notes ?? ""} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="outline"><Link href={itinerary ? `/itineraries/${itinerary.id}` : "/itineraries"}>Cancel</Link></Button>
            <SubmitButton pendingLabel="Saving…">{itinerary ? "Save itinerary" : "Create itinerary"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
