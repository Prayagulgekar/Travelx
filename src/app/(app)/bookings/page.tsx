import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { BOOKING_STATUSES, statusLabel } from "@/lib/domain/status";
import { formatDate, formatMoney } from "@/lib/format";
import { firstParam, parsePage } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listBookings } from "@/features/bookings/queries";
import { getAssignableMembers, getNameDirectory } from "@/features/team/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bookings" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const upcoming = firstParam(sp.view) === "upcoming";
  const f = { q: firstParam(sp.q), status: firstParam(sp.status), assigned: firstParam(sp.assigned), from: firstParam(sp.from), to: firstParam(sp.to), upcoming, page: parsePage(sp.page) };
  const [{ rows, total, pageSize }, names, members] = await Promise.all([listBookings(ctx, f), getNameDirectory(ctx), getAssignableMembers(ctx)]);
  const tab = (href: string, label: string, active: boolean) => (
    <Link href={href} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="Bookings" description="Bookings are created only from accepted quotations, so every price is traceable."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Bookings" }]}
        actions={<div className="flex gap-1 rounded-lg border bg-card p-1">{tab("/bookings", "All bookings", !upcoming)}{tab("/bookings?view=upcoming", "Upcoming trips", upcoming)}</div>} />
      <Card>
        <FilterBar basePath="/bookings" search={f.q} searchPlaceholder="BKG number or destination" dates={{ from: f.from, to: f.to, label: "Departing" }}
          selects={[
            { name: "status", label: "Status", value: f.status, options: BOOKING_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) },
            ...(can(ctx.role, "records.view_all") ? [{ name: "assigned", label: "Agent", value: f.assigned, options: members }] : []),
          ]} />
        {rows.length === 0 ? (
          <EmptyState icon={CalendarRange} title={upcoming ? "No upcoming trips" : "No bookings found"} description="Accept a quotation and convert it to create a booking." />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Booking</TH><TH>Customer</TH><TH>Destination</TH><TH>Travel dates</TH><TH className="hidden md:table-cell text-right">Value</TH><TH className="hidden lg:table-cell">Agent</TH><TH>Status</TH></tr></THead>
              <TBody>
                {rows.map((b) => (
                  <TR key={b.id}>
                    <TD><Link href={`/bookings/${b.id}`} className="font-medium hover:text-secondary hover:underline">{b.booking_code}</Link></TD>
                    <TD>{b.customer?.full_name}<div className="text-xs text-muted-foreground tabular">{b.customer?.phone}</div></TD>
                    <TD>{b.destination}</TD>
                    <TD className="whitespace-nowrap">{formatDate(b.departure_date)} – {formatDate(b.return_date)}</TD>
                    <TD className="hidden md:table-cell text-right tabular">{formatMoney(b.total_amount, b.currency)}</TD>
                    <TD className="hidden lg:table-cell">{b.assigned_to ? names.get(b.assigned_to) ?? "—" : "—"}</TD>
                    <TD><StatusBadge status={b.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={f.page} pageSize={pageSize} total={total} basePath="/bookings" params={{ q: f.q, status: f.status, assigned: f.assigned, from: f.from, to: f.to, view: upcoming ? "upcoming" : undefined }} />
          </>
        )}
      </Card>
    </>
  );
}
