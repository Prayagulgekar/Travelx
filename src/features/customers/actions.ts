"use server";
import { getActionContext } from "@/lib/auth";
import { AppError, type ActionResult } from "@/lib/errors";
import { customerSchema, noteSchema } from "@/lib/validation/customers";
import { uuid } from "@/lib/validation/common";
import type { ActionPayload } from "@/components/shared/action-form";
import { nullable, parseForm, runAction, unwrap } from "../shared";
import { findDuplicateCustomer } from "./queries";

type R = ActionResult<ActionPayload>;

function toRow(input: ReturnType<typeof customerSchema.parse>) {
  return {
    full_name: input.full_name, phone: input.phone, email: nullable(input.email), address: nullable(input.address),
    city: nullable(input.city), country: nullable(input.country), source: nullable(input.source), notes: nullable(input.notes),
  };
}

export async function createCustomerAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("customers.create", async () => {
    const ctx = await getActionContext();
    const input = parseForm(customerSchema, formData);
    const dup = await findDuplicateCustomer(ctx, input.phone, input.email);
    if (dup) {
      throw new AppError(
        dup.archived_at
          ? `An archived customer (${dup.customer_code}) already uses this phone or email. Restore it instead of creating a duplicate.`
          : `${dup.full_name} (${dup.customer_code}) already uses this phone number or email.`,
        409, { phone: "Already used by another customer." });
    }
    const row = { ...toRow(input), ...(input.assigned_to ? { assigned_to: input.assigned_to } : {}) };
    const created = unwrap(await ctx.supabase.from("customers").insert(row).select("id").single()) as { id: string };
    return { ok: true, message: "Customer created.", data: { redirectTo: `/customers/${created.id}` } };
  });
}

export async function updateCustomerAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("customers.update", async () => {
    const ctx = await getActionContext();
    const id = uuid("Customer").parse(formData.get("id"));
    const input = parseForm(customerSchema, formData);
    const dup = await findDuplicateCustomer(ctx, input.phone, input.email, id);
    if (dup) throw new AppError(`${dup.full_name} (${dup.customer_code}) already uses this phone number or email.`, 409, { phone: "Already used by another customer." });
    const row: Record<string, unknown> = toRow(input);
    if (formData.has("assigned_to")) row.assigned_to = input.assigned_to ?? null;
    const res = await ctx.supabase.from("customers").update(row).eq("id", id).select("id");
    if (unwrap(res).length === 0) throw new AppError("Customer not found or you cannot edit it.", 404);
    return { ok: true, message: "Customer updated.", data: { redirectTo: `/customers/${id}` } };
  });
}

export async function setCustomerArchivedAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("customers.archive", async () => {
    const ctx = await getActionContext("customers.archive");
    const id = uuid("Customer").parse(formData.get("id"));
    const archive = formData.get("archive") === "true";
    const res = await ctx.supabase.from("customers").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id).select("id");
    if (unwrap(res).length === 0) throw new AppError("Customer not found.", 404);
    return { ok: true, message: archive ? "Customer archived. Their history is preserved." : "Customer restored." };
  });
}

export async function addCustomerNoteAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("customers.note", async () => {
    const ctx = await getActionContext();
    const customerId = uuid("Customer").parse(formData.get("customer_id"));
    const { body } = parseForm(noteSchema, formData);
    unwrap(await ctx.supabase.from("customer_notes").insert({ customer_id: customerId, body, author_id: ctx.userId }));
    return { ok: true, message: "Note added." };
  });
}
