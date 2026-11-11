import "server-only";
import type { SessionContext } from "@/lib/auth";

export async function getLinkOptions(ctx: SessionContext) {
  const [e, q, b] = await Promise.all([
    ctx.supabase.from("enquiries").select("id, enquiry_code, destination").order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("quotations").select("id, quotation_code, title").order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("bookings").select("id, booking_code, destination").neq("status", "cancelled").order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    enquiries: (e.data ?? []).map((r) => ({ value: r.id as string, label: `${r.enquiry_code} · ${r.destination}` })),
    quotations: (q.data ?? []).map((r) => ({ value: r.id as string, label: `${r.quotation_code} · ${r.title}` })),
    bookings: (b.data ?? []).map((r) => ({ value: r.id as string, label: `${r.booking_code} · ${r.destination}` })),
  };
}
