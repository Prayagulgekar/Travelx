import Link from "next/link";
import { notFound } from "next/navigation";
import { Map, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { calculateBookingBalance, PAYMENT_METHOD_LABELS } from "@/lib/domain/payments";
import { isBookingClosed } from "@/lib/domain/status";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/validation/quotations";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/shared/detail-list";
import { ActivityTimeline } from "@/components/shared/timeline";
import { BookingEditForm, BookingStatusControls, TravellerManager } from "@/components/bookings/booking-controls";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getBooking } from "@/features/bookings/queries";
import { getAssignableMembers, getNameDirectory } from "@/features/team/queries";
import { getActivity } from "@/features/shared-queries";
import type { QuotationItemCategory } from "@/lib/domain/pricing";

export const metadata = { title: "Booking" };

interface Snapshot { quotation?: { quotation_code?: string; subtotal?: string | number; tax_amount?: string | number; discount_amount?: string | number; grand_total?: string | number }; items?: { id: string; description: string; category: QuotationItemCategory; line_total: string | number }[]; captured_at?: string }

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const showPayments = can(ctx.role, "payments.view");
  const data = await getBooking(ctx, id, showPayments);
  if (!data) notFound();
  const { booking: b, travellers, payments, itineraries } = data;
  const [names, members, activity] = await Promise.all([getNameDirectory(ctx), getAssignableMembers(ctx), getActivity(ctx, id, showPayments, 40)]);
  const balance = calculateBookingBalance(b.total_amount, payments, b.status === "cancelled");
  const snap = (b.quotation_snapshot ?? {}) as Snapshot;
  const closed = isBookingClosed(b.status);
  const canWrite = can(ctx.role, "records.view_all") || b.assigned_to === ctx.userId;

  return (
    <>
      <PageHeader title={`${b.destination} · ${b.customer?.full_name ?? ""}`} crumbs={[{ label: "Bookings", href: "/bookings" }, { label: b.booking_code }]}
        meta={<StatusBadge status={b.status} />}
        actions={
          <>
            {itineraries.length === 0 && !closed && <Button asChild variant="outline" size="sm"><Link href={`/itineraries/new?booking=${id}`}><Map />Create itinerary</Link></Button>}
            {showPayments && can(ctx.role, "payments.record") && b.status !== "cancelled" && balance.outstanding.gt(0) && (
              <Button asChild size="sm"><Link href={`/payments/new?booking=${id}`}><Plus />Record payment</Link></Button>
            )}
          </>
        } />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Booking details" />
            <CardBody>
              <DetailList columns={3} items={[
                { label: "Customer", value: b.customer ? <Link href={`/customers/${b.customer.id}`} className="text-secondary hover:underline">{b.customer.full_name}</Link> : "—" },
                { label: "Phone", value: b.customer?.phone }, { label: "Email", value: b.customer?.email ?? "—" },
                { label: "Travel dates", value: `${formatDate(b.departure_date)} – ${formatDate(b.return_date)}` },
                { label: "Source enquiry", value: <Link href={`/enquiries/${b.enquiry_id}`} className="text-secondary hover:underline">View enquiry</Link> },
                { label: "Accepted quotation", value: <Link href={`/quotations/${b.quotation_id}`} className="text-secondary hover:underline">{snap.quotation?.quotation_code ?? "View"}</Link> },
                { label: "Agreed price", value: <span className="font-semibold tabular">{formatMoney(b.total_amount, b.currency)}</span> },
                { label: "Assigned agent", value: b.assigned_to ? names.get(b.assigned_to) ?? "—" : "Unassigned" },
                { label: "Created", value: formatDateTime(b.created_at) },
              ]} />
              {b.status === "cancelled" && <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">Cancelled {formatDateTime(b.cancelled_at)}. Reason: {b.cancellation_reason}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Price snapshot" description={`Frozen when the quotation was accepted${snap.captured_at ? ` (${formatDateTime(snap.captured_at)})` : ""}. Later edits to quotations never change this booking.`} />
            {snap.items && snap.items.length > 0 && (
              <Table><THead><tr><TH>Item</TH><TH>Category</TH><TH className="text-right">Amount</TH></tr></THead><TBody>
                {snap.items.map((i) => <TR key={i.id}><TD>{i.description}</TD><TD className="text-muted-foreground">{CATEGORY_LABELS[i.category] ?? i.category}</TD><TD className="text-right tabular">{formatMoney(i.line_total, b.currency)}</TD></TR>)}
              </TBody></Table>
            )}
            <CardBody className="border-t">
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatMoney(snap.quotation?.subtotal ?? 0, b.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Taxes</dt><dd className="tabular">{formatMoney(snap.quotation?.tax_amount ?? 0, b.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular">− {formatMoney(snap.quotation?.discount_amount ?? 0, b.currency)}</dd></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><dt>Booking value</dt><dd className="tabular">{formatMoney(b.total_amount, b.currency)}</dd></div>
              </dl>
            </CardBody>
          </Card>
          <Card><CardHeader title="Travellers" description="Names as they appear on travel documents" /><CardBody><TravellerManager bookingId={id} travellers={travellers} editable={!closed && canWrite} /></CardBody></Card>
          {showPayments && (
            <Card>
              <CardHeader title="Payments" />
              {payments.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No payments recorded for this booking.</p></CardBody> : (
                <Table><THead><tr><TH>Payment</TH><TH>Date</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH className="text-right">Refunded</TH><TH>Status</TH></tr></THead><TBody>
                  {payments.map((p) => (
                    <TR key={p.id}><TD><Link href={`/payments/${p.id}`} className="font-medium hover:underline">{p.payment_code}</Link></TD><TD>{formatDate(p.payment_date)}</TD><TD>{PAYMENT_METHOD_LABELS[p.method]}</TD>
                      <TD className="text-right tabular">{formatMoney(p.amount, p.currency)}</TD><TD className="text-right tabular">{formatMoney(p.refunded_amount, p.currency)}</TD><TD><StatusBadge status={p.status} /></TD></TR>
                  ))}
                </TBody></Table>
              )}
            </Card>
          )}
          <Card><CardHeader title="Booking timeline" /><CardBody><ActivityTimeline logs={activity} names={names} /></CardBody></Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Status" description="Pending → Confirmed → In progress → Completed" /><CardBody>{canWrite ? <BookingStatusControls id={id} status={b.status} canCancel={can(ctx.role, "bookings.cancel")} /> : <p className="text-sm text-muted-foreground">Only the assigned agent or a manager can update this booking.</p>}</CardBody></Card>
          {showPayments && (
            <Card>
              <CardHeader title="Balance" />
              <CardBody>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Booking value</dt><dd className="tabular">{formatMoney(balance.total.toFixed(2), b.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Received</dt><dd className="tabular">{formatMoney(balance.received.toFixed(2), b.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Refunded</dt><dd className="tabular">− {formatMoney(balance.refunded.toFixed(2), b.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Pending (not counted)</dt><dd className="tabular">{formatMoney(balance.pending.toFixed(2), b.currency)}</dd></div>
                  <div className="flex justify-between border-t pt-2 font-semibold"><dt>Outstanding</dt><dd className="tabular" data-testid="booking-outstanding">{formatMoney(balance.outstanding.toFixed(2), b.currency)}</dd></div>
                </dl>
              </CardBody>
            </Card>
          )}
          {itineraries.length > 0 && (
            <Card><CardHeader title="Itinerary" /><CardBody className="space-y-1.5 text-sm">
              {itineraries.map((i) => <p key={i.id}><Link href={`/itineraries/${i.id}`} className="font-medium text-secondary hover:underline">{i.name}</Link><br /><span className="text-xs text-muted-foreground">{formatDate(i.start_date)} – {formatDate(i.end_date)}</span></p>)}
            </CardBody></Card>
          )}
          {canWrite && !closed && <Card><CardHeader title="Edit booking" /><CardBody><BookingEditForm booking={b} members={members} canAssign={can(ctx.role, "records.reassign")} canEditDates={b.status === "pending_confirmation" || can(ctx.role, "bookings.edit_dates_after_confirmation")} /></CardBody></Card>}
        </div>
      </div>
    </>
  );
}
