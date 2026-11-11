import Link from "next/link";
import { CalendarRange, FileText, Inbox, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { Metric } from "@/components/dashboard/metric";
import { BarChart } from "@/components/dashboard/bar-chart";
import { getDashboardLists, getDashboardMetrics, getMonthlyPerformance, resolveRange } from "@/features/reports/queries";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const range = resolveRange(sp.from, sp.to);
  const showMoney = can(ctx.role, "payments.view");
  const [m, monthly, lists] = await Promise.all([
    getDashboardMetrics(ctx, range.from, range.to),
    getMonthlyPerformance(ctx, 6),
    getDashboardLists(ctx, showMoney),
  ]);
  const cur = ctx.agency.currency;
  const hasAnyData = m.open_enquiries + m.total_enquiries + lists.enquiries.length + lists.quotations.length + lists.trips.length > 0;
  const monthLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "short" });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={ctx.role === "agent" ? "Your enquiries, quotations and trips." : `Operations overview for ${ctx.agency.name}.`}
        actions={
          <>
            <form method="get" className="flex flex-wrap items-center gap-1.5" aria-label="Date range">
              <label htmlFor="d-from" className="sr-only">From</label>
              <Input id="d-from" type="date" name="from" defaultValue={range.from} className="w-[145px]" />
              <span className="text-xs text-muted-foreground">to</span>
              <label htmlFor="d-to" className="sr-only">To</label>
              <Input id="d-to" type="date" name="to" defaultValue={range.to} className="w-[145px]" />
              <Button type="submit" variant="outline">Apply</Button>
            </form>
            <Button asChild><Link href="/enquiries/new"><Plus />New enquiry</Link></Button>
          </>
        }
      />

      {!hasAnyData ? (
        <Card>
          <EmptyState icon={Inbox} title="No records yet" description="Start by adding a customer and recording their travel enquiry. Your dashboard fills in as you work."
            action={<div className="flex gap-2"><Button asChild variant="outline"><Link href="/customers/new">Add customer</Link></Button><Button asChild><Link href="/enquiries/new">New enquiry</Link></Button></div>} />
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="overview-h">
            <h2 id="overview-h" className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business overview · {formatDate(range.from)} – {formatDate(range.to)}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Metric label="Enquiries received" value={m.total_enquiries} definition="Created in the selected period" href="/enquiries" />
              <Metric label="New enquiries" value={m.new_enquiries} definition="Not yet contacted (all time)" href="/enquiries?status=new" tone={m.new_enquiries > 0 ? "warning" : undefined} />
              <Metric label="Quotations pending" value={m.pending_quotations} definition="Draft or reviewed, not yet sent" href="/quotations?status=draft" />
              <Metric label="Awaiting customer" value={m.awaiting_response} definition="Sent and still within validity" href="/quotations?status=sent" />
              <Metric label="Upcoming trips" value={m.upcoming_trips} definition="Departing in the next 30 days" href="/bookings?view=upcoming" />
              <Metric label="Confirmed bookings" value={m.confirmed_bookings} definition="Currently confirmed, not yet travelling" href="/bookings?status=confirmed" />
              <Metric label="Pending confirmation" value={m.pending_bookings} definition="Booked, awaiting confirmation" href="/bookings?status=pending_confirmation" tone={m.pending_bookings > 0 ? "warning" : undefined} />
              <Metric label="Completed" value={m.completed_bookings} definition="Trips completed in the period" href="/bookings?status=completed" />
              <Metric label="Cancelled" value={m.cancelled_bookings} definition="Bookings cancelled in the period" href="/bookings?status=cancelled" tone={m.cancelled_bookings > 0 ? "danger" : undefined} />
              {showMoney && m.revenue !== null ? (
                <Metric label="Recorded revenue" value={formatMoney(m.revenue, cur)} definition="Payments received in the period, minus refunds" href="/payments" tone="success" />
              ) : (
                <Metric label="Trips in progress" value={m.in_progress_bookings} definition="Customers currently travelling" href="/bookings?status=in_progress" />
              )}
            </div>
          </section>

          <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Monthly performance" description={showMoney ? "Enquiries and bookings created per month; revenue is shown in the payment summary." : "Enquiries and bookings created per month."} />
              <CardBody>
                <BarChart ariaLabel="Enquiries and bookings per month for the last six months"
                  data={monthly.map((r) => ({ label: monthLabel(r.month), values: { enquiries: Number(r.enquiries), bookings: Number(r.bookings) } }))}
                  series={[{ key: "enquiries", label: "Enquiries", color: "hsl(214 84% 42%)" }, { key: "bookings", label: "Bookings", color: "hsl(222 62% 20%)" }]} />
              </CardBody>
            </Card>

            {showMoney ? (
              <Card>
                <CardHeader title="Payment summary" description="From recorded transactions only" actions={<Link href="/payments" className="text-[13px] text-secondary hover:underline">All payments</Link>} />
                <CardBody className="space-y-3">
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex justify-between"><dt className="text-muted-foreground">Received (net of refunds)</dt><dd className="font-medium tabular">{formatMoney(m.revenue, cur)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Refunds in period</dt><dd className="tabular">{formatMoney(m.refunds, cur)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">Pending (not counted)</dt><dd className="tabular">{formatMoney(m.pending_payments, cur)}</dd></div>
                    <div className="flex justify-between border-t pt-2.5"><dt className="font-medium">Outstanding from customers</dt><dd className="font-semibold tabular text-warning">{formatMoney(m.outstanding, cur)}</dd></div>
                  </dl>
                  <BarChart ariaLabel="Recorded revenue per month" height={120}
                    data={monthly.map((r) => ({ label: monthLabel(r.month), values: { revenue: Number(r.revenue ?? 0) } }))}
                    series={[{ key: "revenue", label: "Recorded revenue", color: "hsl(152 63% 30%)" }]} formatValue={(n) => formatMoney(n, cur)} />
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardHeader title="Booking overview" />
                <CardBody>
                  <dl className="space-y-2.5 text-sm">
                    {[["Pending confirmation", m.pending_bookings], ["Confirmed", m.confirmed_bookings], ["In progress", m.in_progress_bookings], ["Completed (period)", m.completed_bookings], ["Cancelled (period)", m.cancelled_bookings]].map(([l, v]) => (
                      <div key={l} className="flex justify-between"><dt className="text-muted-foreground">{l}</dt><dd className="font-medium tabular">{v}</dd></div>
                    ))}
                  </dl>
                </CardBody>
              </Card>
            )}
          </div>

          <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
            <Card>
              <CardHeader title="Upcoming travel schedule" actions={<Link href="/bookings?view=upcoming" className="text-[13px] text-secondary hover:underline">View all</Link>} />
              {lists.trips.length === 0 ? <EmptyState icon={CalendarRange} title="No upcoming trips" description="Confirmed and pending bookings appear here by departure date." /> : (
                <ul className="divide-y">
                  {lists.trips.map((t) => (
                    <li key={t.id}>
                      <Link href={`/bookings/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{t.destination} · {t.customer?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{t.booking_code} · {formatDate(t.departure_date)} – {formatDate(t.return_date)}</p>
                        </div>
                        <StatusBadge status={t.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent enquiries" actions={<Link href="/enquiries" className="text-[13px] text-secondary hover:underline">View all</Link>} />
              {lists.enquiries.length === 0 ? <EmptyState icon={Inbox} title="No enquiries" description="New enquiries will be listed here." /> : (
                <ul className="divide-y">
                  {lists.enquiries.map((e) => (
                    <li key={e.id}>
                      <Link href={`/enquiries/${e.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.customer?.full_name} · {e.destination}</p>
                          <p className="text-xs text-muted-foreground">{e.enquiry_code} · departs {formatDate(e.departure_date)}</p>
                        </div>
                        <StatusBadge status={e.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent quotations" actions={<Link href="/quotations" className="text-[13px] text-secondary hover:underline">View all</Link>} />
              {lists.quotations.length === 0 ? <EmptyState icon={FileText} title="No quotations" description="Prepare a quotation from an enquiry." /> : (
                <ul className="divide-y">
                  {lists.quotations.map((q) => (
                    <li key={q.id}>
                      <Link href={`/quotations/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{q.title}</p>
                          <p className="text-xs text-muted-foreground">{q.quotation_code} · {q.customer?.full_name} · {formatMoney(q.grand_total, q.currency)}</p>
                        </div>
                        <StatusBadge status={q.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {showMoney && (
              <Card>
                <CardHeader title="Latest payments" actions={<Link href="/payments" className="text-[13px] text-secondary hover:underline">View all</Link>} />
                {lists.payments.length === 0 ? <EmptyState icon={FileText} title="No payments recorded" description="Payments recorded against bookings appear here." /> : (
                  <ul className="divide-y">
                    {lists.payments.map((p) => (
                      <li key={p.id}>
                        <Link href={`/payments/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium tabular">{formatMoney(p.amount, p.currency)} · {p.customer?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{p.payment_code} · {formatDate(p.payment_date)}</p>
                          </div>
                          <StatusBadge status={p.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
