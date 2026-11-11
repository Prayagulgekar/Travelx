import Link from "next/link";
import { Download } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/domain/payments";
import { BOOKING_STATUSES, ENQUIRY_STATUSES, QUOTATION_STATUSES, statusLabel } from "@/lib/domain/status";
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Metric } from "@/components/dashboard/metric";
import { BarChart } from "@/components/dashboard/bar-chart";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getMonthlyPerformance, getReportSummary, resolveRange } from "@/features/reports/queries";
import { listOutstandingBalances } from "@/features/payments/queries";

export const metadata = { title: "Reports" };

function pct(n: number, d: number) { return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`; }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const financial = can(ctx.role, "reports.financial");
  const [r, monthly, outstanding] = await Promise.all([
    getReportSummary(ctx, range.from, range.to), getMonthlyPerformance(ctx, 12), financial ? listOutstandingBalances(ctx, 200) : Promise.resolve([]),
  ]);
  const cur = ctx.agency.currency;
  const qs = `from=${range.from}&to=${range.to}`;
  const exportBtn = (type: string) => <Button asChild size="sm" variant="ghost"><a href={`/api/reports/export?type=${type}&${qs}`}><Download />CSV</a></Button>;
  const monthLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const outstandingTotal = outstanding.reduce((a, o) => a + Number(o.outstanding), 0);

  return (
    <>
      <PageHeader title="Reports" description={ctx.role === "agent" ? "Your own performance for the selected period." : "Operational and financial reporting for your agency."}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]}
        actions={
          <form method="get" className="flex flex-wrap items-center gap-1.5">
            <label htmlFor="r-from" className="sr-only">From</label><Input id="r-from" type="date" name="from" defaultValue={range.from} className="w-[145px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <label htmlFor="r-to" className="sr-only">To</label><Input id="r-to" type="date" name="to" defaultValue={range.to} className="w-[145px]" />
            <Button type="submit" variant="outline">Apply</Button>
          </form>
        } />
      <p className="mb-4 text-xs text-muted-foreground">Period: {formatDate(range.from)} – {formatDate(range.to)}. Quotation value is pipeline; booking value is agreed price; amount received is recorded payments net of refunds.</p>

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Enquiry conversion" value={pct(r.enquiries_converted, r.enquiries_total)} definition={`${r.enquiries_converted} of ${r.enquiries_total} enquiries created in the period became bookings`} />
          <Metric label="Quotation value" value={formatMoney(r.quotation_value, cur)} definition={`${r.quotations_created} quotations created (not revenue)`} />
          <Metric label="Confirmed booking value" value={formatMoney(r.confirmed_booking_value, cur)} definition="Confirmed, in progress or completed bookings created in the period" />
          {financial && r.amount_received !== null
            ? <Metric label="Amount received" value={formatMoney(Number(r.amount_received) - Number(r.refunds ?? 0), cur)} definition={`Payments received minus ${formatMoney(r.refunds ?? 0, cur)} refunded`} tone="success" />
            : <Metric label="Quotations accepted" value={`${r.quotations_accepted} / ${r.quotations_accepted + r.quotations_rejected}`} definition="Accepted vs. accepted + rejected in the period" />}
        </section>

        <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
          <Card>
            <CardHeader title="Enquiry performance" description="Enquiries created in the period by current status" actions={exportBtn("enquiries")} />
            <Table><THead><tr><TH>Status</TH><TH className="text-right">Enquiries</TH><TH className="text-right">Share</TH></tr></THead><TBody>
              {ENQUIRY_STATUSES.map((s) => <TR key={s}><TD>{statusLabel(s)}</TD><TD className="text-right tabular">{r.enquiries_by_status[s] ?? 0}</TD><TD className="text-right tabular text-muted-foreground">{pct(r.enquiries_by_status[s] ?? 0, r.enquiries_total)}</TD></TR>)}
              <TR><TD className="font-medium">Total</TD><TD className="text-right font-medium tabular">{r.enquiries_total}</TD><TD /></TR>
            </TBody></Table>
          </Card>
          <Card>
            <CardHeader title="Quotations" description="Created in the period, by status" actions={exportBtn("quotations")} />
            <Table><THead><tr><TH>Status</TH><TH className="text-right">Count</TH><TH className="text-right">Value</TH></tr></THead><TBody>
              {QUOTATION_STATUSES.map((s) => <TR key={s}><TD>{statusLabel(s)}</TD><TD className="text-right tabular">{r.quotations_by_status[s]?.count ?? 0}</TD><TD className="text-right tabular">{formatMoney(r.quotations_by_status[s]?.value ?? 0, cur)}</TD></TR>)}
            </TBody></Table>
            <CardBody className="border-t text-sm">Accepted in period: <strong>{r.quotations_accepted}</strong> · Rejected in period: <strong>{r.quotations_rejected}</strong> · Acceptance rate: <strong>{pct(r.quotations_accepted, r.quotations_accepted + r.quotations_rejected)}</strong></CardBody>
          </Card>
          <Card>
            <CardHeader title="Booking status summary" description="Bookings created in the period" actions={exportBtn("bookings")} />
            <Table><THead><tr><TH>Status</TH><TH className="text-right">Bookings</TH></tr></THead><TBody>
              {BOOKING_STATUSES.map((s) => <TR key={s}><TD>{statusLabel(s)}</TD><TD className="text-right tabular">{r.bookings_by_status[s] ?? 0}</TD></TR>)}
            </TBody></Table>
          </Card>
          <Card>
            <CardHeader title="Top destinations" description="Enquiries created in the period" />
            {r.enquiries_by_destination.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No enquiries in this period.</p></CardBody> : (
              <Table><THead><tr><TH>Destination</TH><TH className="text-right">Enquiries</TH><TH className="text-right">Converted</TH></tr></THead><TBody>
                {r.enquiries_by_destination.map((d) => <TR key={d.destination}><TD>{d.destination}</TD><TD className="text-right tabular">{d.count}</TD><TD className="text-right tabular">{d.converted}</TD></TR>)}
              </TBody></Table>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Monthly trend" description={financial ? "Last 12 months: enquiries and bookings created, and recorded revenue" : "Last 12 months: enquiries and bookings created"} />
          <CardBody className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
            <BarChart ariaLabel="Enquiries and bookings per month" data={monthly.map((m) => ({ label: monthLabel(m.month), values: { enquiries: Number(m.enquiries), bookings: Number(m.bookings) } }))}
              series={[{ key: "enquiries", label: "Enquiries", color: "hsl(214 84% 42%)" }, { key: "bookings", label: "Bookings", color: "hsl(222 62% 20%)" }]} />
            {financial && <BarChart ariaLabel="Recorded revenue per month" formatValue={(n) => formatMoney(n, cur)} data={monthly.map((m) => ({ label: monthLabel(m.month), values: { revenue: Number(m.revenue ?? 0) } }))}
              series={[{ key: "revenue", label: `Recorded revenue (${cur})`, color: "hsl(152 63% 30%)" }]} />}
          </CardBody>
        </Card>

        {financial && (
          <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
            <Card>
              <CardHeader title="Payment collection" description="Received in the period, by method" actions={exportBtn("payments")} />
              <Table><THead><tr><TH>Method</TH><TH className="text-right">Payments</TH><TH className="text-right">Amount</TH></tr></THead><TBody>
                {Object.entries(r.collections_by_method ?? {}).length === 0 ? <TR><TD colSpan={3} className="text-muted-foreground">No payments received in this period.</TD></TR> :
                  Object.entries(r.collections_by_method ?? {}).map(([m, v]) => <TR key={m}><TD>{PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m}</TD><TD className="text-right tabular">{v.count}</TD><TD className="text-right tabular">{formatMoney(v.amount, cur)}</TD></TR>)}
                <TR><TD className="font-medium">Refunds in period</TD><TD /><TD className="text-right tabular">− {formatMoney(r.refunds ?? 0, cur)}</TD></TR>
              </TBody></Table>
            </Card>
            <Card id="outstanding">
              <CardHeader title="Outstanding balances" description={`${outstanding.length} active booking(s) · ${formatMoney(outstandingTotal, cur)} to collect`} actions={exportBtn("outstanding")} />
              {outstanding.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">Nothing outstanding.</p></CardBody> : (
                <Table><THead><tr><TH>Booking</TH><TH>Departure</TH><TH className="text-right">Outstanding</TH></tr></THead><TBody>
                  {outstanding.slice(0, 15).map((o) => <TR key={o.booking_id}><TD><Link href={`/bookings/${o.booking_id}`} className="hover:underline">{o.booking_code}</Link></TD><TD>{formatDate(o.departure_date)}</TD><TD className="text-right tabular">{formatMoney(o.outstanding, o.currency)}</TD></TR>)}
                </TBody></Table>
              )}
            </Card>
          </div>
        )}

        <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
          <Card>
            <CardHeader title="Cancellation summary" description={`${r.cancellations.length} booking(s) cancelled in the period`} />
            {r.cancellations.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No cancellations in this period.</p></CardBody> : (
              <Table><THead><tr><TH>Booking</TH><TH>Reason</TH><TH className="text-right">Value</TH></tr></THead><TBody>
                {r.cancellations.map((c) => <TR key={c.id}><TD><Link href={`/bookings/${c.id}`} className="hover:underline">{c.code}</Link><div className="text-xs text-muted-foreground">{c.destination}</div></TD><TD className="text-[13px]">{c.reason}</TD><TD className="text-right tabular">{formatMoney(c.value, cur)}</TD></TR>)}
              </TBody></Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Employee performance" description="Work assigned in the period" actions={exportBtn("employees")} />
            <Table><THead><tr><TH>Member</TH><TH className="text-right">Enquiries</TH><TH className="text-right">Converted</TH><TH className="text-right">Quotes</TH><TH className="text-right">Booking value</TH></tr></THead><TBody>
              {r.employee_performance.map((e) => (
                <TR key={e.user_id}><TD>{e.name}<div className="text-xs text-muted-foreground">{ROLE_LABELS[e.role as Role]}</div></TD><TD className="text-right tabular">{e.enquiries}</TD><TD className="text-right tabular">{e.converted} <span className="text-xs text-muted-foreground">({pct(e.converted, e.enquiries)})</span></TD><TD className="text-right tabular">{e.quotations}</TD><TD className="text-right tabular">{formatMoney(e.booking_value, cur)}</TD></TR>
              ))}
            </TBody></Table>
          </Card>
        </div>
      </div>
    </>
  );
}
