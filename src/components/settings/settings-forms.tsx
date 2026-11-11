"use client";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { updateAgencyAction, updateProfileAction } from "@/features/settings/actions";
import type { Agency, Profile } from "@/types/models";

export function AgencySettingsForm({ agency, readOnly }: { agency: Agency; readOnly: boolean }) {
  return (
    <ActionForm action={updateAgencyAction} className="space-y-6">
      {({ errors }) => (
        <fieldset disabled={readOnly} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Agency name" htmlFor="a-name" error={errors.name} required><Input id="a-name" name="name" defaultValue={agency.name} /></Field>
            <Field label="Legal name" htmlFor="a-legal" error={errors.legal_name}><Input id="a-legal" name="legal_name" defaultValue={agency.legal_name ?? ""} /></Field>
            <Field label="Email" htmlFor="a-email" error={errors.email}><Input id="a-email" name="email" type="email" defaultValue={agency.email ?? ""} /></Field>
            <Field label="Phone" htmlFor="a-phone" error={errors.phone}><Input id="a-phone" name="phone" defaultValue={agency.phone ?? ""} /></Field>
            <Field label="Website" htmlFor="a-web" error={errors.website}><Input id="a-web" name="website" defaultValue={agency.website ?? ""} /></Field>
            <Field label="Tax ID (e.g. GSTIN)" htmlFor="a-tax" error={errors.tax_id}><Input id="a-tax" name="tax_id" defaultValue={agency.tax_id ?? ""} /></Field>
            <Field label="Address" htmlFor="a-addr" error={errors.address} className="md:col-span-2"><Input id="a-addr" name="address" defaultValue={agency.address ?? ""} /></Field>
            <Field label="City" htmlFor="a-city" error={errors.city}><Input id="a-city" name="city" defaultValue={agency.city ?? ""} /></Field>
            <Field label="Country" htmlFor="a-country" error={errors.country}><Input id="a-country" name="country" defaultValue={agency.country ?? ""} /></Field>
          </div>
          <div className="grid gap-4 border-t pt-5 md:grid-cols-4">
            <Field label="Currency" htmlFor="a-cur" error={errors.currency} hint="Used for new enquiries."><Input id="a-cur" name="currency" maxLength={3} defaultValue={agency.currency} /></Field>
            <Field label="Default tax rate (%)" htmlFor="a-rate" error={errors.default_tax_rate}><Input id="a-rate" name="default_tax_rate" inputMode="decimal" defaultValue={String(agency.default_tax_rate)} /></Field>
            <Field label="Agent discount limit (%)" htmlFor="a-disc" error={errors.max_agent_discount_percent} hint="Larger discounts need an admin."><Input id="a-disc" name="max_agent_discount_percent" inputMode="decimal" defaultValue={String(agency.max_agent_discount_percent)} /></Field>
            <Field label="Quotation validity (days)" htmlFor="a-valid" error={errors.quotation_validity_days}><Input id="a-valid" name="quotation_validity_days" inputMode="numeric" defaultValue={agency.quotation_validity_days} /></Field>
          </div>
          <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
            <Field label="Default payment terms" htmlFor="a-pt" error={errors.payment_terms}><Textarea id="a-pt" name="payment_terms" rows={4} defaultValue={agency.payment_terms ?? ""} placeholder="e.g. 30% advance to confirm, balance 15 days before departure." /></Field>
            <Field label="Default terms and conditions" htmlFor="a-terms" error={errors.quotation_terms}><Textarea id="a-terms" name="quotation_terms" rows={4} defaultValue={agency.quotation_terms ?? ""} /></Field>
          </div>
          {!readOnly && <div className="flex justify-end border-t pt-4"><SubmitButton>Save settings</SubmitButton></div>}
        </fieldset>
      )}
    </ActionForm>
  );
}

export function ProfileForm({ profile }: { profile: Profile }) {
  return (
    <ActionForm action={updateProfileAction} className="space-y-4">
      {({ errors }) => (
        <>
          <Field label="Full name" htmlFor="p-name" error={errors.full_name} required><Input id="p-name" name="full_name" defaultValue={profile.full_name} /></Field>
          <Field label="Phone" htmlFor="p-phone" error={errors.phone}><Input id="p-phone" name="phone" defaultValue={profile.phone ?? ""} /></Field>
          <Field label="Job title" htmlFor="p-title" error={errors.job_title}><Input id="p-title" name="job_title" defaultValue={profile.job_title ?? ""} /></Field>
          <div className="flex justify-end"><SubmitButton>Save profile</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}
