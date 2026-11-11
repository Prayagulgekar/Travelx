"use client";
import { Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { manualEnquiryTransitions, statusLabel, type EnquiryStatus } from "@/lib/domain/status";
import { assignEnquiryAction, changeEnquiryStatusAction } from "@/features/enquiries/actions";
import * as React from "react";

export function EnquiryStatusForm({ id, status }: { id: string; status: EnquiryStatus }) {
  const options = manualEnquiryTransitions(status);
  const [next, setNext] = React.useState<string>(options[0] ?? "");
  if (options.length === 0) return <p className="text-sm text-muted-foreground">This enquiry is {statusLabel(status).toLowerCase()} and its status can no longer change.</p>;
  return (
    <ActionForm action={changeEnquiryStatusAction} className="space-y-3">
      {({ errors }) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Field label="Move to" htmlFor="enquiry-status" error={errors.status}>
            <Select id="enquiry-status" name="status" value={next} onChange={(e) => setNext(e.target.value)}>
              {options.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          </Field>
          {(next === "lost" || next === "cancelled") && (
            <Field label="Reason" htmlFor="enquiry-reason" error={errors.reason} required>
              <Textarea id="enquiry-reason" name="reason" rows={2} placeholder="e.g. Chose another agency, trip postponed" />
            </Field>
          )}
          <SubmitButton size="sm" variant="outline" className="w-full">Update status</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function EnquiryAssignForm({ id, assignedTo, members }: { id: string; assignedTo: string | null; members: { value: string; label: string }[] }) {
  return (
    <ActionForm action={assignEnquiryAction} className="flex items-end gap-2">
      {() => (
        <>
          <input type="hidden" name="id" value={id} />
          <div className="flex-1">
            <label htmlFor="assign-to" className="mb-1.5 block text-[13px] font-medium">Assigned agent</label>
            <Select id="assign-to" name="assigned_to" defaultValue={assignedTo ?? ""}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </div>
          <SubmitButton size="md" variant="outline">Assign</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
