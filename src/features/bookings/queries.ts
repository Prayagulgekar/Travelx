import "server-only";
import type { SessionContext } from "@/lib/auth";
import { escapeFilterValue, PAGE_SIZE, pageRange } from "@/lib/utils";
import type { Booking, Payment, Traveller } from "@/types/models";

export interface BookingFilters { q?: string; status?: string; assigned?: string; from?: string; to?: string; upcoming?: boolean; page: number }

export async function listBookings(ctx: SessionContext, f: BookingFilters) {
  const { from, to } = pageRange(f.page);
  let q = ctx.supabase.from("bookings")
    .select("id, booking_code, destination, departure_date, return_date, status, total_amount, currency, assigned_to, created_at, customer:customers(id, full_name, phone)", { count: "exact" })
    .order("departure_date", { ascending: f.upcoming ?? false }).range(from, to);
  if (f.status) q = q.eq("status", f.status);
  if (f.assigned) q = q.eq("assigned_to", f.assigned);
  if (f.from) q = q.gte("departure_date", f.from);
  if (f.to) q = q.lte("departure_date", f.to);
  if (f.upcoming) q = q.in("status", ["pending_confirmation", "confirmed"]).gte("departure_date", new Date().toISOString().slice(0, 10));
  if (f.q) {
    const t = escapeFilterValue(f.q);
    q = q.or(`booking_code.ilike.%${t}%,destination.ilike.%${t}%`);
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Booking[], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getBooking(ctx: SessionContext, id: string, includePayments: boolean) {
  const [b, travellers, payments, itineraries] = await Promise.all([
    ctx.supabase.from("bookings").select("*, customer:customers(id, full_name, phone, email, customer_code)").eq("id", id).maybeSingle(),
    ctx.supabase.from("booking_travellers").select("*").eq("booking_id", id).order("created_at"),
    includePayments
      ? ctx.supabase.from("payments").select("*").eq("booking_id", id).order("payment_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase.from("itineraries").select("id, name, start_date, end_date").eq("booking_id", id),
  ]);
  if (b.error && b.error.code !== "22P02") throw b.error;
  if (!b.data) return null;
  for (const r of [travellers, payments, itineraries]) if (r.error) throw r.error;
  return {
    booking: b.data as unknown as Booking,
    travellers: (travellers.data ?? []) as Traveller[],
    payments: (payments.data ?? []) as Payment[],
    itineraries: (itineraries.data ?? []) as { id: string; name: string; start_date: string; end_date: string }[],
  };
}

export async function listBookingOptions(ctx: SessionContext) {
  const { data, error } = await ctx.supabase.from("booking_balances")
    .select("booking_id, booking_code, total_amount, currency, outstanding, status")
    .neq("status", "cancelled").gt("outstanding", 0).order("booking_code", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as { booking_id: string; booking_code: string; total_amount: string; currency: string; outstanding: string; status: string }[];
}
