import "server-only";
import type { SessionContext } from "@/lib/auth";
import { escapeFilterValue, PAGE_SIZE, pageRange } from "@/lib/utils";
import type { BookingBalanceRow, Payment, Refund } from "@/types/models";

export interface PaymentFilters { q?: string; status?: string; method?: string; from?: string; to?: string; page: number }

export async function listPayments(ctx: SessionContext, f: PaymentFilters) {
  const { from, to } = pageRange(f.page);
  let q = ctx.supabase.from("payments")
    .select("*, booking:bookings(id, booking_code, destination, total_amount, status), customer:customers(id, full_name)", { count: "exact" })
    .order("payment_date", { ascending: false }).order("created_at", { ascending: false }).range(from, to);
  if (f.status) q = q.eq("status", f.status);
  if (f.method) q = q.eq("method", f.method);
  if (f.from) q = q.gte("payment_date", f.from);
  if (f.to) q = q.lte("payment_date", f.to);
  if (f.q) {
    const t = escapeFilterValue(f.q);
    q = q.or(`payment_code.ilike.%${t}%,transaction_reference.ilike.%${t}%`);
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Payment[], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getPayment(ctx: SessionContext, id: string) {
  const [p, refunds] = await Promise.all([
    ctx.supabase.from("payments").select("*, booking:bookings(id, booking_code, destination, departure_date, return_date, total_amount, currency, status), customer:customers(id, full_name, phone, email, customer_code)").eq("id", id).maybeSingle(),
    ctx.supabase.from("payment_refunds").select("*").eq("payment_id", id).order("created_at"),
  ]);
  if (p.error && p.error.code !== "22P02") throw p.error;
  if (!p.data) return null;
  if (refunds.error) throw refunds.error;
  return { payment: p.data as unknown as Payment & { booking: { id: string; booking_code: string; destination: string; departure_date: string; return_date: string; total_amount: string; currency: string; status: string } }, refunds: (refunds.data ?? []) as Refund[] };
}

export async function getBookingBalance(ctx: SessionContext, bookingId: string): Promise<BookingBalanceRow | null> {
  const { data, error } = await ctx.supabase.from("booking_balances").select("*").eq("booking_id", bookingId).maybeSingle();
  if (error && error.code !== "22P02") throw error;
  return (data as BookingBalanceRow | null) ?? null;
}

export async function listOutstandingBalances(ctx: SessionContext, limit = 200) {
  const { data, error } = await ctx.supabase.from("booking_balances").select("*").gt("outstanding", 0).neq("status", "cancelled")
    .order("departure_date").limit(limit);
  if (error) throw error;
  return (data ?? []) as BookingBalanceRow[];
}
