"use client";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton, type FormAction } from "@/components/shared/action-form";
import { CUSTOMER_SOURCES, CUSTOMER_SOURCE_LABELS } from "@/lib/validation/customers";
import type { Customer } from "@/types/models";

export function CustomerForm({ action, customer, members, canAssign }: { action: FormAction; customer?: Customer; members: { value: string; label: string }[]; canAssign: boolean }) {
  return (
    <ActionForm action={action} className="space-y-6">
      {({ errors }) => (
        <>
          {customer && <input type="hidden" name="id" value={customer.id} />}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name" htmlFor="full_name" error={errors.full_name} required>
              <Input id="full_name" name="full_name" defaultValue={customer?.full_name} autoComplete="off" required />
            </Field>
            <Field label="Phone number" htmlFor="phone" error={errors.phone} hint="Include the country code for international numbers, e.g. +91 98200 12345." required>
              <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone} required />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email} hint="Optional. Needed to email quotations.">
              <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
            </Field>
            <Field label="Source" htmlFor="source" error={errors.source}>
              <Select id="source" name="source" defaultValue={customer?.source ?? ""}>
                <option value="">Not specified</option>
                {CUSTOMER_SOURCES.map((s) => <option key={s} value={s}>{CUSTOMER_SOURCE_LABELS[s]}</option>)}
              </Select>
            </Field>
            <Field label="Address" htmlFor="address" error={errors.address} className="md:col-span-2">
              <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
            </Field>
            <Field label="City" htmlFor="city" error={errors.city}>
              <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
            </Field>
            <Field label="Country" htmlFor="country" error={errors.country}>
              <Input id="country" name="country" defaultValue={customer?.country ?? ""} />
            </Field>
            {canAssign && (
              <Field label="Account owner" htmlFor="assigned_to" error={errors.assigned_to}>
                <Select id="assigned_to" name="assigned_to" defaultValue={customer?.assigned_to ?? ""}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Notes" htmlFor="notes" error={errors.notes} hint="Preferences, documents on file, etc." className="md:col-span-2">
              <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ""} rows={3} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="outline"><Link href={customer ? `/customers/${customer.id}` : "/customers"}>Cancel</Link></Button>
            <SubmitButton pendingLabel="Saving…">{customer ? "Save changes" : "Create customer"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
