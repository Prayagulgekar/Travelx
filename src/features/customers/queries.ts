import "server-only";
import type { SessionContext } from "@/lib/auth";
import { escapeFilterValue, PAGE_SIZE, pageRange } from "@/lib/utils";
import { normalizePhone } from "@/lib/validation/customers";
import type { Booking, Customer, Enquiry, Note, Payment, Quotation } from "@/types/models";

export interface CustomerFilters { q?: string; source?: string; assigned?: string; archived?: "only" | "include"; page: number }

export async function listCustomers(ctx: SessionContext, f: CustomerFilters) {
  const { from, to } = pageRange(f.page);
  let q = ctx.supabase.from("customers").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (f.archived === "only") q = q.not("archived_at", "is", null);
  else if (f.archived !== "include") q = q.is("archived_at", null);
  if (f.source) q = q.eq("source", f.source);
  if (f.assigned) q = q.eq("assigned_to", f.assigned);
  if (f.q) {
    const term = escapeFilterValue(f.q);
    const digits = normalizePhone(f.q).replace("+", "");
    const ors = [`full_name.ilike.%${term}%`, `email.ilike.%${term}%`, `customer_code.ilike.%${term}%`, `city.ilike.%${term}%`];
    if (digits.length >= 3) ors.push(`phone_normalized.ilike.%${digits}%`);
    q = q.or(ors.join(","));
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as Customer[], total: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getCustomer(ctx: SessionContext, id: string): Promise<Customer | null> {
  const { data, error } = await ctx.supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (error && error.code !== "22P02") throw error;
  return (data as Customer | null) ?? null;
}

export async function getCustomerHistory(ctx: SessionContext, customerId: string, includePayments: boolean) {
  const [enq, quo, bkg, pay, notes] = await Promise.all([
    ctx.supabase.from("enquiries").select("id, enquiry_code, destination, departure_date, status, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(50),
    ctx.supabase.from("quotations").select("id, quotation_code, title, status, grand_total, currency, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(50),
    ctx.supabase.from("bookings").select("id, booking_code, destination, departure_date, status, total_amount, currency").eq("customer_id", customerId).order("departure_date", { ascending: false }).limit(50),
    includePayments
      ? ctx.supabase.from("payments").select("id, payment_code, amount, currency, status, payment_date, method").eq("customer_id", customerId).order("payment_date", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase.from("customer_notes").select("id, body, author_id, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(100),
  ]);
  for (const r of [enq, quo, bkg, pay, notes]) if (r.error) throw r.error;
  return {
    enquiries: (enq.data ?? []) as Pick<Enquiry, "id" | "enquiry_code" | "destination" | "departure_date" | "status" | "created_at">[],
    quotations: (quo.data ?? []) as Pick<Quotation, "id" | "quotation_code" | "title" | "status" | "grand_total" | "currency" | "created_at">[],
    bookings: (bkg.data ?? []) as Pick<Booking, "id" | "booking_code" | "destination" | "departure_date" | "status" | "total_amount" | "currency">[],
    payments: (pay.data ?? []) as Pick<Payment, "id" | "payment_code" | "amount" | "currency" | "status" | "payment_date" | "method">[],
    notes: (notes.data ?? []) as Note[],
  };
}

/** Lightweight list for pickers (enquiry form). Server-side search keeps it small. */
export async function searchCustomerOptions(ctx: SessionContext, term?: string, limit = 50) {
  let q = ctx.supabase.from("customers").select("id, full_name, phone, customer_code").is("archived_at", null).order("full_name").limit(limit);
  if (term) {
    const t = escapeFilterValue(term);
    q = q.or(`full_name.ilike.%${t}%,phone_normalized.ilike.%${normalizePhone(term).replace("+", "")}%,customer_code.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Pick<Customer, "id" | "full_name" | "phone" | "customer_code">[];
}

/** Finds possible duplicates by normalised phone or email before creating a customer. */
export async function findDuplicateCustomer(ctx: SessionContext, phone: string, email?: string, excludeId?: string) {
  const ors = [`phone_normalized.eq.${normalizePhone(phone)}`];
  if (email) ors.push(`email.eq.${escapeFilterValue(email).replace(/ /g, "")}`);
  let q = ctx.supabase.from("customers").select("id, full_name, customer_code, archived_at").or(ors.join(",")).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return (data?.[0] as Pick<Customer, "id" | "full_name" | "customer_code" | "archived_at"> | undefined) ?? null;
}
