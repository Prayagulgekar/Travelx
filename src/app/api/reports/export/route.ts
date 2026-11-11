import type { NextRequest } from "next/server";
import { getActionContext } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { AppError, ForbiddenError } from "@/lib/errors";
import { errorResponse, toCsv } from "@/lib/http";
import { resolveRange, getReportSummary } from "@/features/reports/queries";
import { listOutstandingBalances } from "@/features/payments/queries";

const MAX_ROWS = 5000;

/** CSV exports for report tables. All queries run under the user's RLS policies. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getActionContext();
    const sp = request.nextUrl.searchParams;
    const type = sp.get("type") ?? "";
    const { from, to } = resolveRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
    const fromTs = `${from}T00:00:00`;
    const toTs = `${to}T23:59:59.999`;
    let csv: string;

    switch (type) {
      case "enquiries": {
        const { data, error } = await ctx.supabase.from("enquiries")
          .select("enquiry_code, created_at, status, priority, source_location, destination, departure_date, return_date, adults, children, infants, rooms, budget, currency, customer:customers(full_name, phone)")
          .gte("created_at", fromTs).lte("created_at", toTs).order("created_at").limit(MAX_ROWS);
        if (error) throw error;
        csv = toCsv(["Enquiry", "Created", "Status", "Priority", "From", "Destination", "Departure", "Return", "Adults", "Children", "Infants", "Rooms", "Budget", "Currency", "Customer", "Phone"],
          (data ?? []).map((r) => { const c = r.customer as unknown as { full_name: string; phone: string } | null; return [r.enquiry_code, r.created_at, r.status, r.priority, r.source_location, r.destination, r.departure_date, r.return_date, r.adults, r.children, r.infants, r.rooms, r.budget, r.currency, c?.full_name, c?.phone]; }));
        break;
      }
      case "quotations": {
        const { data, error } = await ctx.supabase.from("quotations")
          .select("quotation_code, created_at, status, title, issue_date, valid_until, subtotal, tax_amount, discount_amount, grand_total, currency, customer:customers(full_name)")
          .gte("created_at", fromTs).lte("created_at", toTs).order("created_at").limit(MAX_ROWS);
        if (error) throw error;
        csv = toCsv(["Quotation", "Created", "Status", "Title", "Issued", "Valid until", "Subtotal", "Tax", "Discount", "Grand total", "Currency", "Customer"],
          (data ?? []).map((r) => [r.quotation_code, r.created_at, r.status, r.title, r.issue_date, r.valid_until, r.subtotal, r.tax_amount, r.discount_amount, r.grand_total, r.currency, (r.customer as unknown as { full_name: string } | null)?.full_name]));
        break;
      }
      case "bookings": {
        const { data, error } = await ctx.supabase.from("bookings")
          .select("booking_code, created_at, status, destination, departure_date, return_date, total_amount, currency, cancellation_reason, customer:customers(full_name)")
          .gte("created_at", fromTs).lte("created_at", toTs).order("created_at").limit(MAX_ROWS);
        if (error) throw error;
        csv = toCsv(["Booking", "Created", "Status", "Destination", "Departure", "Return", "Booking value", "Currency", "Cancellation reason", "Customer"],
          (data ?? []).map((r) => [r.booking_code, r.created_at, r.status, r.destination, r.departure_date, r.return_date, r.total_amount, r.currency, r.cancellation_reason, (r.customer as unknown as { full_name: string } | null)?.full_name]));
        break;
      }
      case "payments": {
        if (!can(ctx.role, "reports.financial")) throw new ForbiddenError();
        const { data, error } = await ctx.supabase.from("payments")
          .select("payment_code, payment_date, status, method, amount, refunded_amount, currency, transaction_reference, booking:bookings(booking_code), customer:customers(full_name)")
          .gte("payment_date", from).lte("payment_date", to).order("payment_date").limit(MAX_ROWS);
        if (error) throw error;
        csv = toCsv(["Payment", "Date", "Status", "Method", "Amount", "Refunded", "Currency", "Reference", "Booking", "Customer"],
          (data ?? []).map((r) => [r.payment_code, r.payment_date, r.status, r.method, r.amount, r.refunded_amount, r.currency, r.transaction_reference, (r.booking as unknown as { booking_code: string } | null)?.booking_code, (r.customer as unknown as { full_name: string } | null)?.full_name]));
        break;
      }
      case "outstanding": {
        if (!can(ctx.role, "reports.financial")) throw new ForbiddenError();
        const rows = await listOutstandingBalances(ctx, MAX_ROWS);
        csv = toCsv(["Booking", "Status", "Departure", "Booking value", "Received", "Refunded", "Pending", "Outstanding", "Currency"],
          rows.map((r) => [r.booking_code, r.status, r.departure_date, r.total_amount, r.amount_received, r.amount_refunded, r.amount_pending, r.outstanding, r.currency]));
        break;
      }
      case "employees": {
        const summary = await getReportSummary(ctx, from, to);
        csv = toCsv(["Member", "Role", "Enquiries", "Converted", "Quotations", "Bookings", "Booking value"],
          summary.employee_performance.map((e) => [e.name, e.role, e.enquiries, e.converted, e.quotations, e.bookings, e.booking_value]));
        break;
      }
      default:
        throw new AppError("Unknown export type.", 400);
    }
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="travelx-${type}-${from}-to-${to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "reports.export");
  }
}
