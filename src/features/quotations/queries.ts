import "server-only";
import type { SessionContext } from "@/lib/auth";
import { escapeFilterValue, PAGE_SIZE, pageRange } from "@/lib/utils";
import type { Quotation, QuotationItem } from "@/types/models";

export interface QuotationFilters { q?: string; status?: string; from?: string; to?: string; page: number }

export async function listQuotations(ctx: SessionContext, f: QuotationFilters) {
  const { from, to } = pageRange(f.page);
  let q = ctx.supabase.from("quotations")
    .select("id, quotation_code, title, status, grand_total, currency, valid_until, issue_date, created_at, created_by, customer:customers(id, full_name), enquiry:enquiries(id, enquiry_code, destination, budget)", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, to);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("issue_date", f.from);
  if (f.to) q = q.lte("issue_date", f.to);
  if (f.q) {
    const t = escapeFilterValue(f.q);
    q = q.or(`quotation_code.ilike.%${t}%,title.ilike.%${t}%`);
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Quotation[], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getQuotation(ctx: SessionContext, id: string) {
  const [qr, items, booking] = await Promise.all([
    ctx.supabase.from("quotations")
      .select("*, customer:customers(id, full_name, phone, email, customer_code, address, city, country), enquiry:enquiries(id, enquiry_code, destination, source_location, departure_date, return_date, adults, children, infants, rooms, budget, currency, status)")
      .eq("id", id).maybeSingle(),
    ctx.supabase.from("quotation_items").select("*").eq("quotation_id", id).order("position").order("created_at"),
    ctx.supabase.from("bookings").select("id, booking_code").eq("quotation_id", id).maybeSingle(),
  ]);
  if (qr.error && qr.error.code !== "22P02") throw qr.error;
  if (!qr.data) return null;
  if (items.error) throw items.error;
  return {
    quotation: qr.data as unknown as Quotation,
    items: (items.data ?? []) as QuotationItem[],
    booking: (booking.data as { id: string; booking_code: string } | null) ?? null,
  };
}
