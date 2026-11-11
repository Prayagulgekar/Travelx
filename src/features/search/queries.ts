import "server-only";
import type { SessionContext } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { escapeFilterValue } from "@/lib/utils";
import { normalizePhone } from "@/lib/validation/customers";

export interface SearchHit { type: "customer" | "enquiry" | "quotation" | "booking" | "payment"; id: string; title: string; subtitle: string; status?: string; href: string }

/** Global search across modules. Each query is limited and runs under RLS. */
export async function globalSearch(ctx: SessionContext, term: string): Promise<SearchHit[]> {
  const t = escapeFilterValue(term);
  if (t.length < 2) return [];
  const digits = normalizePhone(term).replace("+", "");
  const customerOr = [`full_name.ilike.%${t}%`, `customer_code.ilike.%${t}%`, `email.ilike.%${t}%`];
  if (digits.length >= 3) customerOr.push(`phone_normalized.ilike.%${digits}%`);
  const [c, e, q, b, p] = await Promise.all([
    ctx.supabase.from("customers").select("id, customer_code, full_name, phone, archived_at").or(customerOr.join(",")).limit(8),
    ctx.supabase.from("enquiries").select("id, enquiry_code, destination, departure_date, status").or(`enquiry_code.ilike.%${t}%,destination.ilike.%${t}%`).limit(8),
    ctx.supabase.from("quotations").select("id, quotation_code, title, status").or(`quotation_code.ilike.%${t}%,title.ilike.%${t}%`).limit(8),
    ctx.supabase.from("bookings").select("id, booking_code, destination, departure_date, status").or(`booking_code.ilike.%${t}%,destination.ilike.%${t}%`).limit(8),
    can(ctx.role, "payments.view")
      ? ctx.supabase.from("payments").select("id, payment_code, transaction_reference, status, amount, currency").or(`payment_code.ilike.%${t}%,transaction_reference.ilike.%${t}%`).limit(5)
      : Promise.resolve({ data: [] as never[], error: null }),
  ]);
  const hits: SearchHit[] = [];
  (c.data ?? []).forEach((r) => hits.push({ type: "customer", id: r.id, title: r.full_name, subtitle: `${r.customer_code} · ${r.phone}${r.archived_at ? " · archived" : ""}`, href: `/customers/${r.id}` }));
  (e.data ?? []).forEach((r) => hits.push({ type: "enquiry", id: r.id, title: `${r.enquiry_code} · ${r.destination}`, subtitle: `Departs ${r.departure_date}`, status: r.status, href: `/enquiries/${r.id}` }));
  (q.data ?? []).forEach((r) => hits.push({ type: "quotation", id: r.id, title: `${r.quotation_code} · ${r.title}`, subtitle: "Quotation", status: r.status, href: `/quotations/${r.id}` }));
  (b.data ?? []).forEach((r) => hits.push({ type: "booking", id: r.id, title: `${r.booking_code} · ${r.destination}`, subtitle: `Departs ${r.departure_date}`, status: r.status, href: `/bookings/${r.id}` }));
  ((p.data ?? []) as { id: string; payment_code: string; transaction_reference: string | null; status: string; amount: string; currency: string }[])
    .forEach((r) => hits.push({ type: "payment", id: r.id, title: r.payment_code, subtitle: `${r.currency} ${r.amount}${r.transaction_reference ? ` · Ref ${r.transaction_reference}` : ""}`, status: r.status, href: `/payments/${r.id}` }));
  return hits;
}
