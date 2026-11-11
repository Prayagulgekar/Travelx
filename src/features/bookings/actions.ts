"use server";
import { getActionContext } from "@/lib/auth";
import { AppError, type ActionResult } from "@/lib/errors";
import { bookingStatusSchema, bookingUpdateSchema, travellerSchema } from "@/lib/validation/bookings";
import { uuid } from "@/lib/validation/common";
import { canTransitionBooking, type BookingStatus } from "@/lib/domain/status";
import { can } from "@/lib/domain/permissions";
import type { ActionPayload } from "@/components/shared/action-form";
import { nullable, parseForm, runAction, unwrap } from "../shared";

type R = ActionResult<ActionPayload>;

export async function updateBookingAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("bookings.update", async () => {
    const ctx = await getActionContext();
    const id = uuid("Booking").parse(formData.get("id"));
    const input = parseForm(bookingUpdateSchema, formData);
    const patch: Record<string, unknown> = { departure_date: input.departure_date, return_date: input.return_date, notes: nullable(input.notes) };
    if (can(ctx.role, "records.reassign") && formData.has("assigned_to")) patch.assigned_to = input.assigned_to ?? null;
    const rows = unwrap(await ctx.supabase.from("bookings").update(patch).eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Booking not found or you cannot edit it.", 404);
    return { ok: true, message: "Booking updated." };
  });
}

export async function changeBookingStatusAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("bookings.status", async () => {
    const ctx = await getActionContext();
    const id = uuid("Booking").parse(formData.get("id"));
    const { status, cancellation_reason } = parseForm(bookingStatusSchema, formData);
    if (status === "cancelled" && !can(ctx.role, "bookings.cancel")) throw new AppError("Only owners and administrators can cancel bookings.", 403);
    const current = unwrap(await ctx.supabase.from("bookings").select("status").eq("id", id).single()) as { status: BookingStatus };
    if (!canTransitionBooking(current.status, status)) throw new AppError(`A booking cannot move from ${current.status.replace(/_/g, " ")} to ${status.replace(/_/g, " ")}.`);
    const patch: Record<string, unknown> = { status };
    if (status === "cancelled") patch.cancellation_reason = cancellation_reason;
    const rows = unwrap(await ctx.supabase.from("bookings").update(patch).eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Booking not found or you cannot update it.", 404);
    return { ok: true, message: status === "cancelled" ? "Booking cancelled." : "Booking status updated." };
  });
}

export async function addTravellerAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("bookings.traveller.add", async () => {
    const ctx = await getActionContext();
    const bookingId = uuid("Booking").parse(formData.get("booking_id"));
    const t = parseForm(travellerSchema, formData);
    unwrap(await ctx.supabase.from("booking_travellers").insert({
      booking_id: bookingId, full_name: t.full_name, traveller_type: t.traveller_type, date_of_birth: nullable(t.date_of_birth),
      nationality: nullable(t.nationality), notes: nullable(t.notes),
    }));
    return { ok: true, message: "Traveller added." };
  });
}

export async function removeTravellerAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("bookings.traveller.remove", async () => {
    const ctx = await getActionContext();
    const id = uuid("Traveller").parse(formData.get("id"));
    const rows = unwrap(await ctx.supabase.from("booking_travellers").delete().eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Traveller not found.", 404);
    return { ok: true, message: "Traveller removed." };
  });
}
