"use server";
import { getActionContext } from "@/lib/auth";
import { AppError, type ActionResult } from "@/lib/errors";
import { assignSchema, enquiryCreateSchema, enquiryStatusSchema, enquiryUpdateSchema } from "@/lib/validation/enquiries";
import { noteSchema } from "@/lib/validation/customers";
import { uuid } from "@/lib/validation/common";
import { canTransitionEnquiry, type EnquiryStatus } from "@/lib/domain/status";
import { can } from "@/lib/domain/permissions";
import type { ActionPayload } from "@/components/shared/action-form";
import { nullable, parseForm, runAction, unwrap } from "../shared";
import { findDuplicateEnquiry } from "./queries";

type R = ActionResult<ActionPayload>;

function toRow(i: ReturnType<typeof enquiryUpdateSchema.parse>) {
  return {
    customer_id: i.customer_id, source_location: i.source_location, destination: i.destination,
    departure_date: i.departure_date, return_date: i.return_date, adults: i.adults, children: i.children, infants: i.infants,
    rooms: i.rooms, budget: nullable(i.budget), currency: i.currency, travel_category: nullable(i.travel_category),
    preferred_transport: nullable(i.preferred_transport), accommodation_preference: nullable(i.accommodation_preference),
    special_requirements: nullable(i.special_requirements), priority: i.priority,
  };
}

export async function createEnquiryAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("enquiries.create", async () => {
    const ctx = await getActionContext();
    const input = parseForm(enquiryCreateSchema, formData);

    // Idempotency: the form carries a key generated when it was opened. A resubmission of the
    // same form (double click, network retry) returns the enquiry that was already created.
    const existing = await ctx.supabase.from("enquiries").select("id").eq("idempotency_key", input.idempotency_key).maybeSingle();
    if (existing.data) return { ok: true, message: "Enquiry already saved.", data: { redirectTo: `/enquiries/${existing.data.id}` } };

    if (!input.confirm_duplicate) {
      const dup = await findDuplicateEnquiry(ctx, input.customer_id, input.destination, input.departure_date);
      if (dup) {
        throw new AppError(`An open enquiry (${dup.enquiry_code}) already exists for this customer, destination and date. Tick "Create anyway" to continue.`,
          409, { confirm_duplicate: `Possible duplicate of ${dup.enquiry_code}.` });
      }
    }
    const row: Record<string, unknown> = { ...toRow(input), idempotency_key: input.idempotency_key };
    if (input.assigned_to && can(ctx.role, "records.reassign")) row.assigned_to = input.assigned_to;
    const res = await ctx.supabase.from("enquiries").insert(row).select("id").single();
    if (res.error?.code === "23505" && /idempotency/.test(res.error.message)) {
      const again = await ctx.supabase.from("enquiries").select("id").eq("idempotency_key", input.idempotency_key).single();
      return { ok: true, message: "Enquiry already saved.", data: { redirectTo: `/enquiries/${again.data?.id}` } };
    }
    const created = unwrap(res) as { id: string };
    return { ok: true, message: "Enquiry created.", data: { redirectTo: `/enquiries/${created.id}` } };
  });
}

export async function updateEnquiryAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("enquiries.update", async () => {
    const ctx = await getActionContext();
    const id = uuid("Enquiry").parse(formData.get("id"));
    const input = parseForm(enquiryUpdateSchema, formData);
    const rows = unwrap(await ctx.supabase.from("enquiries").update(toRow(input)).eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Enquiry not found or you cannot edit it.", 404);
    return { ok: true, message: "Enquiry updated.", data: { redirectTo: `/enquiries/${id}` } };
  });
}

export async function changeEnquiryStatusAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("enquiries.status", async () => {
    const ctx = await getActionContext();
    const id = uuid("Enquiry").parse(formData.get("id"));
    const { status, reason } = parseForm(enquiryStatusSchema, formData);
    const current = unwrap(await ctx.supabase.from("enquiries").select("status").eq("id", id).single()) as { status: EnquiryStatus };
    if (status === "converted") throw new AppError("Enquiries are converted automatically when a booking is created.");
    if (!canTransitionEnquiry(current.status, status)) throw new AppError(`Cannot move an enquiry from ${current.status} to ${status}.`);
    unwrap(await ctx.supabase.from("enquiries").update({ status, status_reason: nullable(reason) }).eq("id", id).select("id"));
    return { ok: true, message: "Enquiry status updated." };
  });
}

export async function assignEnquiryAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("enquiries.assign", async () => {
    const ctx = await getActionContext("records.reassign");
    const id = uuid("Enquiry").parse(formData.get("id"));
    const { assigned_to } = parseForm(assignSchema, formData);
    const rows = unwrap(await ctx.supabase.from("enquiries").update({ assigned_to: assigned_to ?? null }).eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Enquiry not found.", 404);
    return { ok: true, message: assigned_to ? "Enquiry assigned." : "Enquiry unassigned." };
  });
}

export async function addEnquiryNoteAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("enquiries.note", async () => {
    const ctx = await getActionContext();
    const enquiryId = uuid("Enquiry").parse(formData.get("enquiry_id"));
    const { body } = parseForm(noteSchema, formData);
    unwrap(await ctx.supabase.from("enquiry_notes").insert({ enquiry_id: enquiryId, body, author_id: ctx.userId }));
    return { ok: true, message: "Note added." };
  });
}
