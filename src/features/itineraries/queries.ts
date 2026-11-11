import "server-only";
import type { SessionContext } from "@/lib/auth";
import { escapeFilterValue, PAGE_SIZE, pageRange } from "@/lib/utils";
import type { Itinerary, ItineraryActivity, ItineraryDay } from "@/types/models";

export async function listItineraries(ctx: SessionContext, f: { q?: string; page: number }) {
  const { from, to } = pageRange(f.page);
  let q = ctx.supabase.from("itineraries").select("*", { count: "exact" }).order("start_date", { ascending: false }).range(from, to);
  if (f.q) {
    const t = escapeFilterValue(f.q);
    q = q.or(`name.ilike.%${t}%,destination.ilike.%${t}%`);
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as Itinerary[], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getItinerary(ctx: SessionContext, id: string) {
  const it = await ctx.supabase.from("itineraries").select("*").eq("id", id).maybeSingle();
  if (it.error && it.error.code !== "22P02") throw it.error;
  if (!it.data) return null;
  const days = await ctx.supabase.from("itinerary_days").select("*, activities:itinerary_activities(*)").eq("itinerary_id", id).order("day_number");
  if (days.error) throw days.error;
  const sorted = ((days.data ?? []) as ItineraryDay[]).map((d) => ({
    ...d,
    activities: [...(d.activities ?? [])].sort((a: ItineraryActivity, b: ItineraryActivity) => a.position - b.position),
  }));
  const itinerary = it.data as Itinerary;
  const [enquiry, quotation, booking] = await Promise.all([
    itinerary.enquiry_id ? ctx.supabase.from("enquiries").select("id, enquiry_code, customer:customers(full_name)").eq("id", itinerary.enquiry_id).maybeSingle() : Promise.resolve({ data: null }),
    itinerary.quotation_id ? ctx.supabase.from("quotations").select("id, quotation_code, status").eq("id", itinerary.quotation_id).maybeSingle() : Promise.resolve({ data: null }),
    itinerary.booking_id ? ctx.supabase.from("bookings").select("id, booking_code, status").eq("id", itinerary.booking_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    itinerary,
    days: sorted,
    enquiry: enquiry.data as unknown as { id: string; enquiry_code: string; customer: { full_name: string } | null } | null,
    quotation: quotation.data as { id: string; quotation_code: string; status: string } | null,
    booking: booking.data as { id: string; booking_code: string; status: string } | null,
  };
}
