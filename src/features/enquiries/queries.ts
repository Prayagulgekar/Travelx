import "server-only";
import type { SessionContext } from "@/lib/auth";
import { escapeFilterValue, PAGE_SIZE, pageRange } from "@/lib/utils";
import type { Enquiry, Note } from "@/types/models";

export interface EnquiryFilters {
  q?: string; status?: string; assigned?: string; destination?: string; priority?: string; from?: string; to?: string; page: number;
}

const LIST_COLUMNS = "id, enquiry_code, destination, source_location, departure_date, return_date, adults, children, infants, budget, currency, status, priority, assigned_to, created_at, customer:customers(id, full_name, phone, customer_code)";

export async function listEnquiries(ctx: SessionContext, f: EnquiryFilters) {
  const { from, to } = pageRange(f.page);
  let q = ctx.supabase.from("enquiries").select(LIST_COLUMNS, { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (f.status) q = q.eq("status", f.status);
  if (f.assigned === "unassigned") q = q.is("assigned_to", null);
  else if (f.assigned) q = q.eq("assigned_to", f.assigned);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.destination) q = q.ilike("destination", `%${escapeFilterValue(f.destination)}%`);
  if (f.from) q = q.gte("departure_date", f.from);
  if (f.to) q = q.lte("departure_date", f.to);
  if (f.q) {
    const t = escapeFilterValue(f.q);
    q = q.or(`enquiry_code.ilike.%${t}%,destination.ilike.%${t}%,source_location.ilike.%${t}%`);
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Enquiry[], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getEnquiry(ctx: SessionContext, id: string): Promise<Enquiry | null> {
  const { data, error } = await ctx.supabase.from("enquiries")
    .select("*, customer:customers(id, full_name, phone, email, customer_code)").eq("id", id).maybeSingle();
  if (error && error.code !== "22P02") throw error;
  return (data as unknown as Enquiry | null) ?? null;
}

export async function getEnquiryRelated(ctx: SessionContext, id: string) {
  const [notes, quotations, bookings, itineraries] = await Promise.all([
    ctx.supabase.from("enquiry_notes").select("id, body, author_id, created_at").eq("enquiry_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("quotations").select("id, quotation_code, title, status, grand_total, currency, valid_until, created_at").eq("enquiry_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("bookings").select("id, booking_code, status, departure_date").eq("enquiry_id", id),
    ctx.supabase.from("itineraries").select("id, name, start_date, end_date").eq("enquiry_id", id),
  ]);
  for (const r of [notes, quotations, bookings, itineraries]) if (r.error) throw r.error;
  return {
    notes: (notes.data ?? []) as Note[],
    quotations: (quotations.data ?? []) as { id: string; quotation_code: string; title: string; status: string; grand_total: string | number; currency: string; valid_until: string; created_at: string }[],
    bookings: (bookings.data ?? []) as { id: string; booking_code: string; status: string; departure_date: string }[],
    itineraries: (itineraries.data ?? []) as { id: string; name: string; start_date: string; end_date: string }[],
  };
}

/** Open enquiries for the same customer, destination and departure date: likely duplicates. */
export async function findDuplicateEnquiry(ctx: SessionContext, customerId: string, destination: string, departure: string) {
  const { data } = await ctx.supabase.from("enquiries").select("id, enquiry_code")
    .eq("customer_id", customerId).eq("departure_date", departure).ilike("destination", escapeFilterValue(destination))
    .not("status", "in", "(lost,cancelled)").limit(1);
  return (data?.[0] as { id: string; enquiry_code: string } | undefined) ?? null;
}

export async function listEnquiryOptions(ctx: SessionContext) {
  const { data, error } = await ctx.supabase.from("enquiries")
    .select("id, enquiry_code, destination, departure_date, return_date, customer:customers(full_name)")
    .not("status", "in", "(converted,lost,cancelled)").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as { id: string; enquiry_code: string; destination: string; departure_date: string; return_date: string; customer: { full_name: string } | null }[];
}
