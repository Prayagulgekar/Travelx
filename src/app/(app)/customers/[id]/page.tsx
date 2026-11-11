import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { formatDate, formatMoney } from "@/lib/format";
import { CUSTOMER_SOURCE_LABELS } from "@/lib/validation/customers";
import { PAYMENT_METHOD_LABELS } from "@/lib/domain/payments";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/shared/detail-list";
import { NotesPanel } from "@/components/shared/notes";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { ActivityTimeline } from "@/components/shared/timeline";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getCustomer, getCustomerHistory } from "@/features/customers/queries";
import { addCustomerNoteAction, setCustomerArchivedAction } from "@/features/customers/actions";
import { getNameDirectory } from "@/features/team/queries";
import { getActivity } from "@/features/shared-queries";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();
  const showPayments = can(ctx.role, "payments.view");
  const [history, names, activity] = await Promise.all([getCustomerHistory(ctx, id, showPayments), getNameDirectory(ctx), getActivity(ctx, id, false, 20)]);
  const archived = Boolean(customer.archived_at);

  return (
    <>
      <PageHeader title={customer.full_name} crumbs={[{ label: "Customers", href: "/customers" }, { label: customer.customer_code }]}
        meta={archived ? <Badge tone="warning">Archived</Badge> : undefined}
        actions={
          <>
            {!archived && <Button asChild variant="outline" size="sm"><Link href={`/customers/${id}/edit`}><Pencil />Edit</Link></Button>}
            {can(ctx.role, "customers.archive") && (
              <ConfirmAction action={setCustomerArchivedAction} hidden={{ id, archive: archived ? "false" : "true" }}
                title={archived ? "Restore customer?" : "Archive customer?"}
                description={archived ? "The customer will appear in lists and can receive new enquiries again." : "Archived customers are hidden from lists and cannot receive new enquiries. Their enquiries, bookings and payments are kept."}
                confirmLabel={archived ? "Restore" : "Archive"} triggerLabel={archived ? "Restore" : "Archive"} danger={!archived} />
            )}
            {!archived && <Button asChild size="sm"><Link href={`/enquiries/new?customer=${id}`}><Plus />New enquiry</Link></Button>}
          </>
        } />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Contact details" />
            <CardBody>
              <DetailList items={[
                { label: "Phone", value: customer.phone }, { label: "Email", value: customer.email ?? "—" },
                { label: "Address", value: customer.address ?? "—" }, { label: "City / country", value: [customer.city, customer.country].filter(Boolean).join(", ") || "—" },
                { label: "Source", value: customer.source ? CUSTOMER_SOURCE_LABELS[customer.source as keyof typeof CUSTOMER_SOURCE_LABELS] : "—" },
                { label: "Account owner", value: customer.assigned_to ? names.get(customer.assigned_to) ?? "—" : "Unassigned" },
                { label: "Created", value: formatDate(customer.created_at) }, { label: "Last updated", value: formatDate(customer.updated_at) },
              ]} />
              {customer.notes && <p className="mt-4 whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">{customer.notes}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Enquiries" description={`${history.enquiries.length} on record`} />
            {history.enquiries.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No enquiries for this customer.</p></CardBody> : (
              <Table><THead><tr><TH>Enquiry</TH><TH>Destination</TH><TH>Departure</TH><TH>Status</TH></tr></THead><TBody>
                {history.enquiries.map((e) => (
                  <TR key={e.id}><TD><Link className="font-medium hover:underline" href={`/enquiries/${e.id}`}>{e.enquiry_code}</Link></TD><TD>{e.destination}</TD><TD>{formatDate(e.departure_date)}</TD><TD><StatusBadge status={e.status} /></TD></TR>
                ))}
              </TBody></Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Quotations" />
            {history.quotations.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No quotations yet.</p></CardBody> : (
              <Table><THead><tr><TH>Quotation</TH><TH>Title</TH><TH className="text-right">Grand total</TH><TH>Status</TH></tr></THead><TBody>
                {history.quotations.map((q) => (
                  <TR key={q.id}><TD><Link className="font-medium hover:underline" href={`/quotations/${q.id}`}>{q.quotation_code}</Link></TD><TD>{q.title}</TD><TD className="text-right tabular">{formatMoney(q.grand_total, q.currency)}</TD><TD><StatusBadge status={q.status} /></TD></TR>
                ))}
              </TBody></Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Bookings" />
            {history.bookings.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No bookings yet.</p></CardBody> : (
              <Table><THead><tr><TH>Booking</TH><TH>Destination</TH><TH>Departure</TH><TH className="text-right">Value</TH><TH>Status</TH></tr></THead><TBody>
                {history.bookings.map((b) => (
                  <TR key={b.id}><TD><Link className="font-medium hover:underline" href={`/bookings/${b.id}`}>{b.booking_code}</Link></TD><TD>{b.destination}</TD><TD>{formatDate(b.departure_date)}</TD><TD className="text-right tabular">{formatMoney(b.total_amount, b.currency)}</TD><TD><StatusBadge status={b.status} /></TD></TR>
                ))}
              </TBody></Table>
            )}
          </Card>
          {showPayments && (
            <Card>
              <CardHeader title="Payments" />
              {history.payments.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No payments recorded.</p></CardBody> : (
                <Table><THead><tr><TH>Payment</TH><TH>Date</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH>Status</TH></tr></THead><TBody>
                  {history.payments.map((p) => (
                    <TR key={p.id}><TD><Link className="font-medium hover:underline" href={`/payments/${p.id}`}>{p.payment_code}</Link></TD><TD>{formatDate(p.payment_date)}</TD><TD>{PAYMENT_METHOD_LABELS[p.method]}</TD><TD className="text-right tabular">{formatMoney(p.amount, p.currency)}</TD><TD><StatusBadge status={p.status} /></TD></TR>
                  ))}
                </TBody></Table>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Internal notes" /><CardBody><NotesPanel notes={history.notes} names={names} action={addCustomerNoteAction} hidden={{ customer_id: id }} /></CardBody></Card>
          <Card><CardHeader title="Activity" /><CardBody><ActivityTimeline logs={activity} names={names} /></CardBody></Card>
        </div>
      </div>
    </>
  );
}
