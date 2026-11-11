"use server";
import { getActionContext } from "@/lib/auth";
import { AppError, type ActionResult } from "@/lib/errors";
import { activitySchema, itineraryDaySchema, itinerarySchema } from "@/lib/validation/misc";
import { uuid } from "@/lib/validation/common";
import type { ActionPayload } from "@/components/shared/action-form";
import { nullable, parseForm, runAction, unwrap } from "../shared";

type R = ActionResult<ActionPayload>;

function row(i: ReturnType<typeof itinerarySchema.parse>) {
  return {
    name: i.name, destination: i.destination, start_date: i.start_date, end_date: i.end_date, notes: nullable(i.notes),
    enquiry_id: i.enquiry_id ?? null, quotation_id: i.quotation_id ?? null, booking_id: i.booking_id ?? null,
  };
}

export async function createItineraryAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.create", async () => {
    const ctx = await getActionContext();
    const input = parseForm(itinerarySchema, formData);
    const created = unwrap(await ctx.supabase.from("itineraries").insert(row(input)).select("id").single()) as { id: string };
    // Create one empty day per travel date so the builder starts with the full day-wise structure.
    const dayCount = Math.round((Date.parse(input.end_date) - Date.parse(input.start_date)) / 86_400_000) + 1;
    const days = Array.from({ length: dayCount }, (_, i) => ({ itinerary_id: created.id, day_number: i + 1 }));
    unwrap(await ctx.supabase.from("itinerary_days").insert(days));
    return { ok: true, message: "Itinerary created.", data: { redirectTo: `/itineraries/${created.id}` } };
  });
}

export async function updateItineraryAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.update", async () => {
    const ctx = await getActionContext();
    const id = uuid("Itinerary").parse(formData.get("id"));
    const input = parseForm(itinerarySchema, formData);
    const dayCount = Math.round((Date.parse(input.end_date) - Date.parse(input.start_date)) / 86_400_000) + 1;
    const existing = unwrap(await ctx.supabase.from("itinerary_days").select("id, day_number, activities:itinerary_activities(id)").eq("itinerary_id", id)) as unknown as { id: string; day_number: number; activities: { id: string }[] }[];
    const dropping = existing.filter((d) => d.day_number > dayCount);
    if (dropping.some((d) => d.activities.length > 0)) {
      throw new AppError("Shortening the dates would remove days that still have activities. Remove those activities first.", 422, { end_date: "Days with activities would be removed." });
    }
    if (dropping.length) unwrap(await ctx.supabase.from("itinerary_days").delete().in("id", dropping.map((d) => d.id)));
    const rows = unwrap(await ctx.supabase.from("itineraries").update(row(input)).eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Itinerary not found or you cannot edit it.", 404);
    // Re-save existing days so their dates follow the new start date; add missing days.
    const have = new Set(existing.filter((d) => d.day_number <= dayCount).map((d) => d.day_number));
    for (const d of existing.filter((x) => x.day_number <= dayCount)) {
      unwrap(await ctx.supabase.from("itinerary_days").update({ day_number: d.day_number }).eq("id", d.id).select("id"));
    }
    const missing = Array.from({ length: dayCount }, (_, i) => i + 1).filter((n) => !have.has(n)).map((n) => ({ itinerary_id: id, day_number: n }));
    if (missing.length) unwrap(await ctx.supabase.from("itinerary_days").insert(missing));
    return { ok: true, message: "Itinerary updated.", data: { redirectTo: `/itineraries/${id}` } };
  });
}

export async function deleteItineraryAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.delete", async () => {
    const ctx = await getActionContext();
    const id = uuid("Itinerary").parse(formData.get("id"));
    const rows = unwrap(await ctx.supabase.from("itineraries").delete().eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Itinerary not found or you cannot delete it.", 404);
    return { ok: true, message: "Itinerary deleted.", data: { redirectTo: "/itineraries" } };
  });
}

export async function updateDayAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.day", async () => {
    const ctx = await getActionContext();
    const id = uuid("Day").parse(formData.get("id"));
    const input = parseForm(itineraryDaySchema, formData);
    unwrap(await ctx.supabase.from("itinerary_days").update({ title: nullable(input.title), notes: nullable(input.notes) }).eq("id", id).select("id"));
    return { ok: true, message: "Day updated." };
  });
}

function activityRow(a: ReturnType<typeof activitySchema.parse>) {
  return {
    title: a.title, description: nullable(a.description), location: nullable(a.location), start_time: nullable(a.start_time),
    duration_minutes: a.duration_minutes ?? null, notes: nullable(a.notes),
  };
}

export async function addActivityAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.activity.add", async () => {
    const ctx = await getActionContext();
    const dayId = uuid("Day").parse(formData.get("day_id"));
    const input = parseForm(activitySchema, formData);
    const last = await ctx.supabase.from("itinerary_activities").select("position").eq("day_id", dayId).order("position", { ascending: false }).limit(1).maybeSingle();
    const position = ((last.data as { position: number } | null)?.position ?? -1) + 1;
    unwrap(await ctx.supabase.from("itinerary_activities").insert({ day_id: dayId, position, ...activityRow(input) }));
    return { ok: true, message: "Activity added." };
  });
}

export async function updateActivityAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.activity.update", async () => {
    const ctx = await getActionContext();
    const id = uuid("Activity").parse(formData.get("id"));
    const input = parseForm(activitySchema, formData);
    const rows = unwrap(await ctx.supabase.from("itinerary_activities").update(activityRow(input)).eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Activity not found.", 404);
    return { ok: true, message: "Activity updated." };
  });
}

export async function removeActivityAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.activity.remove", async () => {
    const ctx = await getActionContext();
    const id = uuid("Activity").parse(formData.get("id"));
    const rows = unwrap(await ctx.supabase.from("itinerary_activities").delete().eq("id", id).select("id"));
    if (rows.length === 0) throw new AppError("Activity not found.", 404);
    return { ok: true, message: "Activity removed." };
  });
}

export async function moveActivityAction(_prev: R | null, formData: FormData): Promise<R> {
  return runAction("itineraries.activity.move", async () => {
    const ctx = await getActionContext();
    const id = uuid("Activity").parse(formData.get("id"));
    const direction = formData.get("direction") === "up" ? "up" : "down";
    unwrap(await ctx.supabase.rpc("move_itinerary_activity", { p_activity_id: id, p_direction: direction }));
    return { ok: true };
  });
}
