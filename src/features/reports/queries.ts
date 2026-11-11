import "server-only";
import type { SessionContext } from "@/lib/auth";
import { todayIso } from "@/lib/validation/common";

export interface DashboardMetrics {
  total_enquiries: number; new_enquiries: number; open_enquiries: number; pending_quotations: number; awaiting_response: number;
  confirmed_bookings: number; pending_bookings: number; in_progress_bookings: number; upcoming_trips: number;
  completed_bookings: number; cancelled_bookings: number; revenue: number | null; refunds: number | null;
  pending_payments: number | null; outstanding: number | null; is_manager: boolean;
}

export interface MonthlyRow { month: string; enquiries: number; bookings: number; revenue: number | null }

export interface ReportSummary {
  enquiries_by_status: Record<string, number>; enquiries_total: number; enquiries_converted: number;
  enquiries_by_destination: { destination: string; count: number; converted: number }[];
  quotations_created: number; quotations_by_status: Record<string, { count: number; value: number }>;
  quotations_accepted: number; quotations_rejected: number; quotation_value: number;
  bookings_by_status: Record<string, number>; confirmed_booking_value: number;
  cancellations: { code: string; id: string; destination: string; reason: string; cancelled_at: string; value: number }[];
  collections_by_method: Record<string, { count: number; amount: number }> | null; amount_received: number | null; refunds: number | null;
  employee_performance: { user_id: string; name: string; role: string; enquiries: number; converted: number; quotations: number; bookings: number; booking_value: number }[];
  is_manager: boolean; is_owner: boolean;
}

/** Default reporting window: the current calendar month to date. */
export function resolveRange(from?: string, to?: string): { from: string; to: string } {
  const today = todayIso();
  const start = `${today.slice(0, 8)}01`;
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const f = valid(from) ?? start;
  const t = valid(to) ?? today;
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}

export async function getDashboardMetrics(ctx: SessionContext, from: string, to: string): Promise<DashboardMetrics> {
  const { data, error } = await ctx.supabase.rpc("dashboard_metrics", { p_from: from, p_to: to });
  if (error) throw error;
  return data as DashboardMetrics;
}

export async function getMonthlyPerformance(ctx: SessionContext, months = 6): Promise<MonthlyRow[]> {
  const { data, error } = await ctx.supabase.rpc("monthly_performance", { p_months: months });
  if (error) throw error;
  return (data ?? []) as MonthlyRow[];
}

export async function getReportSummary(ctx: SessionContext, from: string, to: string): Promise<ReportSummary> {
  const { data, error } = await ctx.supabase.rpc("report_summary", { p_from: from, p_to: to });
  if (error) throw error;
  return data as ReportSummary;
}

export async function getDashboardLists(ctx: SessionContext, includePayments: boolean) {
  const today = todayIso();
  const [enq, quo, trips, pays] = await Promise.all([
    ctx.supabase.from("enquiries").select("id, enquiry_code, destination, departure_date, status, priority, created_at, customer:customers(full_name)").order("created_at", { ascending: false }).limit(6),
    ctx.supabase.from("quotations").select("id, quotation_code, title, status, grand_total, currency, valid_until, customer:customers(full_name)").order("updated_at", { ascending: false }).limit(6),
    ctx.supabase.from("bookings").select("id, booking_code, destination, departure_date, return_date, status, customer:customers(full_name)")
      .in("status", ["pending_confirmation", "confirmed", "in_progress"]).gte("return_date", today).order("departure_date").limit(6),
    includePayments
      ? ctx.supabase.from("payments").select("id, payment_code, amount, currency, status, payment_date, method, customer:customers(full_name)").order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [enq, quo, trips, pays]) if (r.error) throw r.error;
  type Named = { customer: { full_name: string } | null };
  return {
    enquiries: (enq.data ?? []) as unknown as ({ id: string; enquiry_code: string; destination: string; departure_date: string; status: string; priority: string; created_at: string } & Named)[],
    quotations: (quo.data ?? []) as unknown as ({ id: string; quotation_code: string; title: string; status: string; grand_total: string; currency: string; valid_until: string } & Named)[],
    trips: (trips.data ?? []) as unknown as ({ id: string; booking_code: string; destination: string; departure_date: string; return_date: string; status: string } & Named)[],
    payments: (pays.data ?? []) as unknown as ({ id: string; payment_code: string; amount: string; currency: string; status: string; payment_date: string; method: string } & Named)[],
  };
}
