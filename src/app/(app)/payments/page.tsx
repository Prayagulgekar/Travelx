import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/domain/payments";
import { PAYMENT_STATUSES, statusLabel } from "@/lib/domain/status";
import { formatDate, formatMoney } from "@/lib/format";
import { firstParam, parsePage } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listOutstandingBalances, listPayments } from "@/features/payments/queries";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCapability("payments.view");
  const sp = await searchParams;
  const f = { q: firstParam(sp.q), status: firstParam(sp.status), method: firstParam(sp.method), from: firstParam(sp.from), to: firstParam(sp.to), page: parsePage(sp.page) };
  const [{ rows, total, pageSize }, outstanding] = await Promise.all([listPayments(ctx, f), listOutstandingBalances(ctx, 8)]);
  return (
    <>
      <PageHeader title="Payments" description="Manually recorded customer payments and refunds. Only received payments count towards revenue."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Payments" }]}
        actions={<Button asChild><Link href="/payments/new"><Plus />Record payment</Link></Button>} />
      <div className="space-y-6">
        <Card>
          <FilterBar basePath="/payments" search={f.q} searchPlaceholder="PAY number or transaction reference" dates={{ from: f.from, to: f.to, label: "Paid" }}
            selects={[
              { name: "status", label: "Status", value: f.status, options: PAYMENT_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) },
              { name: "method", label: "Method", value: f.method, options: PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })) },
            ]} />
          {rows.length === 0 ? <EmptyState icon={CreditCard} title="No payments found" description="Record a payment against a booking when the customer pays." /> : (
            <>
              <Table>
                <THead><tr><TH>Payment</TH><TH>Booking</TH><TH>Customer</TH><TH>Date</TH><TH className="hidden md:table-cell">Method</TH><TH className="text-right">Amount</TH><TH>Status</TH></tr></THead>
                <TBody>
                  {rows.map((p) => (
                    <TR key={p.id}>
                      <TD><Link href={`/payments/${p.id}`} className="font-medium hover:text-secondary hover:underline">{p.payment_code}</Link><div className="text-xs text-muted-foreground">{p.transaction_reference ?? "—"}</div></TD>
                      <TD>{p.booking ? <Link href={`/bookings/${p.booking.id}`} className="hover:underline">{p.booking.booking_code}</Link> : "—"}</TD>
                      <TD>{p.customer?.full_name}</TD>
                      <TD className="whitespace-nowrap">{formatDate(p.payment_date)}</TD>
                      <TD className="hidden md:table-cell">{PAYMENT_METHOD_LABELS[p.method]}</TD>
                      <TD className="text-right tabular">{formatMoney(p.amount, p.currency)}{Number(p.refunded_amount) > 0 && <div className="text-xs text-muted-foreground">refunded {formatMoney(p.refunded_amount, p.currency)}</div>}</TD>
                      <TD><StatusBadge status={p.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={f.page} pageSize={pageSize} total={total} basePath="/payments" params={{ q: f.q, status: f.status, method: f.method, from: f.from, to: f.to }} />
            </>
          )}
        </Card>
        <Card>
          <CardHeader title="Outstanding balances" description="Active bookings with money still to collect, by departure date" actions={<Link href="/reports#outstanding" className="text-[13px] text-secondary hover:underline">Full report</Link>} />
          {outstanding.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">Nothing outstanding.</p> : (
            <Table><THead><tr><TH>Booking</TH><TH>Departure</TH><TH className="text-right">Value</TH><TH className="text-right">Received</TH><TH className="text-right">Outstanding</TH><TH /></tr></THead><TBody>
              {outstanding.map((o) => (
                <TR key={o.booking_id}>
                  <TD><Link href={`/bookings/${o.booking_id}`} className="font-medium hover:underline">{o.booking_code}</Link></TD><TD>{formatDate(o.departure_date)}</TD>
                  <TD className="text-right tabular">{formatMoney(o.total_amount, o.currency)}</TD><TD className="text-right tabular">{formatMoney(Number(o.amount_received) - Number(o.amount_refunded), o.currency)}</TD>
                  <TD className="text-right font-medium tabular text-warning">{formatMoney(o.outstanding, o.currency)}</TD>
                  <TD className="text-right"><Link href={`/payments/new?booking=${o.booking_id}`} className="text-[13px] text-secondary hover:underline">Record</Link></TD>
                </TR>
              ))}
            </TBody></Table>
          )}
        </Card>
      </div>
    </>
  );
}
