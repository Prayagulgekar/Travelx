"use client";
import { Textarea } from "@/components/ui/input";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";

export function NoteForm({ action, hidden }: { action: FormAction; hidden: Record<string, string> }) {
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-2">
      {({ errors }) => (
        <>
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label htmlFor="note-body" className="sr-only">Add an internal note</label>
          <Textarea id="note-body" name="body" rows={2} placeholder="Add an internal note (not visible to the customer)" aria-invalid={errors.body ? true : undefined} />
          {errors.body && <p className="text-xs text-danger">{errors.body}</p>}
          <div className="flex justify-end"><SubmitButton size="sm" variant="outline">Add note</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}
