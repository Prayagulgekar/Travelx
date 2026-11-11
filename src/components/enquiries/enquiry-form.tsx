"use client";
import Link from "next/link";
import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton, type FormAction } from "@/components/shared/action-form";
import { PRIORITIES, TRANSPORT_LABELS, TRANSPORT_OPTIONS, TRAVEL_CATEGORIES, TRAVEL_CATEGORY_LABELS } from "@/lib/validation/enquiries";
import type { Enquiry } from "@/types/models";
import { CustomerPicker } from "./customer-picker";

interface Props {
  action: FormAction;
  enquiry?: Enquiry;
  initialCustomer?: { id: string; full_name: string; phone: string; customer_code: string } | null;
  members: { value: string; label: string }[];
  canAssign: boolean;
  currency: string;
  today: string;
}

export function EnquiryForm({ action, enquiry, initialCustomer, members, canAssign, currency, today }: Props) {
  // A fresh key per form instance makes resubmissions of the same form idempotent.
  const [idempotencyKey] = React.useState(() => crypto.randomUUID());
  const [dates, setDates] = React.useState({ dep: enquiry?.departure_date ?? "", ret: enquiry?.return_date ?? "" });
  const nights = dates.dep && dates.ret && dates.ret >= dates.dep ? Math.round((Date.parse(dates.ret) - Date.parse(dates.dep)) / 86_400_000) : null;

  return (
    <ActionForm action={action} className="space-y-6">
      {({ errors }) => (
        <>
          {enquiry ? <input type="hidden" name="id" value={enquiry.id} /> : <input type="hidden" name="idempotency_key" value={idempotencyKey} />}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold">Customer and trip</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Customer" htmlFor="customer_id" error={errors.customer_id} required className="md:col-span-2">
                <CustomerPicker name="customer_id" initial={initialCustomer} error={errors.customer_id} />
              </Field>
              <Field label="Travelling from" htmlFor="source_location" error={errors.source_location} required>
                <Input id="source_location" name="source_location" defaultValue={enquiry?.source_location} placeholder="e.g. Mumbai" />
              </Field>
              <Field label="Destination" htmlFor="destination" error={errors.destination} required>
                <Input id="destination" name="destination" defaultValue={enquiry?.destination} placeholder="e.g. Bali, Indonesia" />
              </Field>
              <Field label="Departure date" htmlFor="departure_date" error={errors.departure_date} required>
                <Input id="departure_date" name="departure_date" type="date" min={enquiry ? undefined : today} defaultValue={enquiry?.departure_date}
                  onChange={(e) => setDates((d) => ({ ...d, dep: e.target.value }))} />
              </Field>
              <Field label="Return date" htmlFor="return_date" error={errors.return_date} required hint={nights !== null ? `${nights} night${nights === 1 ? "" : "s"}` : undefined}>
                <Input id="return_date" name="return_date" type="date" min={dates.dep || today} defaultValue={enquiry?.return_date}
                  onChange={(e) => setDates((d) => ({ ...d, ret: e.target.value }))} />
              </Field>
            </div>
          </section>
          <section className="space-y-4 border-t pt-5">
            <h2 className="text-sm font-semibold">Travellers</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Adults" htmlFor="adults" error={errors.adults} required><Input id="adults" name="adults" type="number" min={1} max={99} defaultValue={enquiry?.adults ?? 2} /></Field>
              <Field label="Children (2–11)" htmlFor="children" error={errors.children}><Input id="children" name="children" type="number" min={0} max={99} defaultValue={enquiry?.children ?? 0} /></Field>
              <Field label="Infants (under 2)" htmlFor="infants" error={errors.infants}><Input id="infants" name="infants" type="number" min={0} max={20} defaultValue={enquiry?.infants ?? 0} /></Field>
              <Field label="Rooms" htmlFor="rooms" error={errors.rooms} required><Input id="rooms" name="rooms" type="number" min={1} max={50} defaultValue={enquiry?.rooms ?? 1} /></Field>
            </div>
          </section>
          <section className="space-y-4 border-t pt-5">
            <h2 className="text-sm font-semibold">Requirements</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={`Budget (${currency})`} htmlFor="budget" error={errors.budget} hint="Total for the whole group. Leave blank if unknown.">
                <Input id="budget" name="budget" inputMode="decimal" defaultValue={enquiry?.budget != null ? String(enquiry.budget) : ""} placeholder="e.g. 150000" />
              </Field>
              <input type="hidden" name="currency" value={enquiry?.currency ?? currency} />
              <Field label="Travel category" htmlFor="travel_category" error={errors.travel_category}>
                <Select id="travel_category" name="travel_category" defaultValue={enquiry?.travel_category ?? ""}>
                  <option value="">Not specified</option>
                  {TRAVEL_CATEGORIES.map((c) => <option key={c} value={c}>{TRAVEL_CATEGORY_LABELS[c]}</option>)}
                </Select>
              </Field>
              <Field label="Preferred transport" htmlFor="preferred_transport" error={errors.preferred_transport}>
                <Select id="preferred_transport" name="preferred_transport" defaultValue={enquiry?.preferred_transport ?? ""}>
                  <option value="">Not specified</option>
                  {TRANSPORT_OPTIONS.map((c) => <option key={c} value={c}>{TRANSPORT_LABELS[c]}</option>)}
                </Select>
              </Field>
              <Field label="Accommodation preference" htmlFor="accommodation_preference" error={errors.accommodation_preference} className="md:col-span-3">
                <Input id="accommodation_preference" name="accommodation_preference" defaultValue={enquiry?.accommodation_preference ?? ""} placeholder="e.g. 4-star, sea view, twin beds" />
              </Field>
              <Field label="Special requirements" htmlFor="special_requirements" error={errors.special_requirements} className="md:col-span-3">
                <Textarea id="special_requirements" name="special_requirements" defaultValue={enquiry?.special_requirements ?? ""} placeholder="Dietary needs, accessibility, visa help, celebrations…" />
              </Field>
            </div>
          </section>
          <section className="space-y-4 border-t pt-5">
            <h2 className="text-sm font-semibold">Handling</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Priority" htmlFor="priority" error={errors.priority}>
                <Select id="priority" name="priority" defaultValue={enquiry?.priority ?? "medium"}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</option>)}
                </Select>
              </Field>
              {!enquiry && canAssign && (
                <Field label="Assign to" htmlFor="assigned_to" error={errors.assigned_to}>
                  <Select id="assigned_to" name="assigned_to" defaultValue="">
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            {errors.confirm_duplicate && (
              <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2.5 text-sm">
                <input type="checkbox" name="confirm_duplicate" className="mt-0.5" />
                <span><strong>{errors.confirm_duplicate}</strong> Create anyway</span>
              </label>
            )}
          </section>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="outline"><Link href={enquiry ? `/enquiries/${enquiry.id}` : "/enquiries"}>Cancel</Link></Button>
            <SubmitButton pendingLabel="Saving…">{enquiry ? "Save changes" : "Create enquiry"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
