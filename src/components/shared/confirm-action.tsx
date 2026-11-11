"use client";
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";

/** Serializable field description so Server Components can request extra inputs. */
export interface ConfirmField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "date" | "decimal";
  required?: boolean;
  defaultValue?: string;
  rows?: number;
}

interface ConfirmActionProps {
  action: FormAction;
  title: string;
  description: string;
  confirmLabel: string;
  triggerLabel: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  danger?: boolean;
  hidden?: Record<string, string>;
  /** Extra inputs (e.g. a reason field) rendered inside the dialog. Client components only. */
  children?: (errors: Record<string, string>) => React.ReactNode;
  /** Declarative extra inputs; safe to pass from Server Components. */
  fields?: ConfirmField[];
  testId?: string;
}

/** Dialog-confirmed server action for destructive or irreversible operations. */
export function ConfirmAction({ action, title, description, confirmLabel, triggerLabel, triggerVariant = "outline", triggerSize = "sm", danger, hidden, children, fields, testId }: ConfirmActionProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} data-testid={testId}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="space-y-4">
          {({ errors }) => (
            <>
              {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              {fields?.map((f) => {
                const id = `cf-${f.name}`;
                return (
                  <Field key={f.name} label={f.label} htmlFor={id} error={errors[f.name]} required={f.required}>
                    {f.type === "textarea"
                      ? <Textarea id={id} name={f.name} rows={f.rows ?? 2} defaultValue={f.defaultValue} />
                      : <Input id={id} name={f.name} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "decimal" ? "decimal" : undefined} defaultValue={f.defaultValue} />}
                  </Field>
                );
              })}
              {children?.(errors)}
              <div className="flex justify-end gap-2 pt-1">
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <SubmitButton variant={danger ? "danger" : "primary"}>{confirmLabel}</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
