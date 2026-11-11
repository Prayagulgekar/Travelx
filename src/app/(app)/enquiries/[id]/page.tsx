import Link from "next/link";
import { notFound } from "next/navigation";
import { FilePlus2, Map, Pencil } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { isEnquiryClosed } from "@/lib/domain/status";
import { formatDate, formatMoney, travellerSummary } from "@/lib/format";
import { TRANSPORT_LABELS, TRAVEL_CATEGORY_LABELS } from "@/lib/validation/enquiries";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/shared/detail-list";
import { NotesPanel } from "@/components/shared/notes";
import { ActivityTimeline } from "@/components/shared/timeline";
import { EnquiryAssignForm, EnquiryStatusForm } from "@/components/enquiries/enquiry-controls";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getEnquiry, getEnquiryRelated } from "@/features/enquiries/queries";
import { addEnquiryNoteAction } from "@/features/enquiries/actions";
import { getAssignableMembers, getNameDirectory } from "@/features/team/queries";
import { getActivity } from "@/features/shared-queries";

export const metadata = { title: "Enquiry" };

export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const enquiry = await getEnquiry(ctx, id);
  if (!enquiry) notFound();
  const [related, names, members, activity] = await Promise.all([getEnquiryRelated(ctx, id), getNameDirectory(ctx), getAssignableMembers(ctx), getActivity(ctx, id, true, 30)]);
  const closed = isEnquiryClosed(enquiry.status) || enquiry.status === "lost";
  const e = enquiry;
  return (
    <>
      <PageHeader title={`${e.destination} for ${e.customer?.full_name ?? "customer"}`} crumbs={[{ label: "Enquiries", href: "/enquiries" }, { label: e.enquiry_code }]}
        meta={<><StatusBadge status={e.status} /><StatusBadge status={e.priority} /></>}
        actions={!closed && (
          <>
            <Button asChild variant="outline" size="sm"><Link href={`/enquiries/${id}/edit`}><Pencil />Edit</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href={`/itineraries/new?enquiry=${id}`}><Map />Itinerary</Link></Button>
            <Button asChild size="sm"><Link href={`/quotations/new?enquiry=${id}`}><FilePlus2 />Prepare quotation</Link></Button>
          </>
        )} />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Travel requirements" />
            <CardBody>
              <DetailList columns={3} items={[
                { label: "Customer", value: e.customer ? <Link className="text-secondary hover:underline" href={`/customers/${e.customer.id}`}>{e.customer.full_name}</Link> : "—" },
                { label: "Phone", value: e.customer?.phone }, { label: "Email", value: e.customer?.email ?? "—" },
                { label: "From", value: e.source_location }, { label: "Destination", value: e.destination },
                { label: "Dates", value: `${formatDate(e.departure_date)} – ${formatDate(e.return_date)} (${e.duration_nights} nights)` },
                { label: "Travellers", value: travellerSummary(e.adults, e.children, e.infants) }, { label: "Rooms", value: e.rooms },
                { label: "Budget", value: e.budget != null ? formatMoney(e.budget, e.currency) : "Not given" },
                { label: "Category", value: e.travel_category ? TRAVEL_CATEGORY_LABELS[e.travel_category as keyof typeof TRAVEL_CATEGORY_LABELS] : "—" },
                { label: "Transport", value: e.preferred_transport ? TRANSPORT_LABELS[e.preferred_transport as keyof typeof TRANSPORT_LABELS] : "—" },
                { label: "Accommodation", value: e.accommodation_preference ?? "—" },
              ]} />
              {e.special_requirements && <div className="mt-4"><p className="text-xs text-muted-foreground">Special requirements</p><p className="mt-1 whitespace-pre-wrap text-sm">{e.special_requirements}</p></div>}
              {e.status_reason && (e.status === "lost" || e.status === "cancelled") && <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">Reason: {e.status_reason}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Quotations" description="Each quotation is a priced proposal for this enquiry." actions={!closed && <Button asChild size="sm" variant="outline"><Link href={`/quotations/new?enquiry=${id}`}>New quotation</Link></Button>} />
            {related.quotations.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No quotations yet. Prepare one to send the customer a priced proposal.</p></CardBody> : (
              <Table><THead><tr><TH>Quotation</TH><TH>Title</TH><TH>Valid until</TH><TH className="text-right">Grand total</TH><TH>Status</TH></tr></THead><TBody>
                {related.quotations.map((q) => (
                  <TR key={q.id}><TD><Link className="font-medium hover:underline" href={`/quotations/${q.id}`}>{q.quotation_code}</Link></TD><TD>{q.title}</TD><TD>{formatDate(q.valid_until)}</TD><TD className="text-right tabular">{formatMoney(q.grand_total, q.currency)}</TD><TD><StatusBadge status={q.status} /></TD></TR>
                ))}
              </TBody></Table>
            )}
          </Card>
          {(related.bookings.length > 0 || related.itineraries.length > 0) && (
            <Card>
              <CardHeader title="Bookings and itineraries" />
              <CardBody className="space-y-2 text-sm">
                {related.bookings.map((b) => <p key={b.id}><Link href={`/bookings/${b.id}`} className="font-medium text-secondary hover:underline">{b.booking_code}</Link> · departs {formatDate(b.departure_date)} · <StatusBadge status={b.status} /></p>)}
                {related.itineraries.map((i) => <p key={i.id}><Link href={`/itineraries/${i.id}`} className="font-medium text-secondary hover:underline">{i.name}</Link> · {formatDate(i.start_date)} – {formatDate(i.end_date)}</p>)}
              </CardBody>
            </Card>
          )}
          <Card><CardHeader title="Activity" /><CardBody><ActivityTimeline logs={activity} names={names} /></CardBody></Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Workflow" />
            <CardBody className="space-y-5">
              <EnquiryStatusForm id={id} status={e.status} />
              {can(ctx.role, "records.reassign") && !closed ? <EnquiryAssignForm id={id} assignedTo={e.assigned_to} members={members} /> : (
                <p className="text-sm"><span className="text-muted-foreground">Assigned agent:</span> {e.assigned_to ? names.get(e.assigned_to) : "Unassigned"}</p>
              )}
              <p className="text-xs text-muted-foreground">Created {formatDate(e.created_at)} by {e.created_by ? names.get(e.created_by) ?? "a former member" : "—"}</p>
            </CardBody>
          </Card>
          <Card><CardHeader title="Internal notes" /><CardBody><NotesPanel notes={related.notes} names={names} action={addEnquiryNoteAction} hidden={{ enquiry_id: id }} /></CardBody></Card>
        </div>
      </div>
    </>
  );
}
