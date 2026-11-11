import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DayEditor } from "@/components/itineraries/day-editor";
import { ItineraryForm } from "@/components/itineraries/itinerary-form";
import { getItinerary } from "@/features/itineraries/queries";
import { getLinkOptions } from "@/features/itineraries/options";
import { deleteItineraryAction, updateItineraryAction } from "@/features/itineraries/actions";

export const metadata = { title: "Itinerary" };

export default async function ItineraryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const { view } = await searchParams;
  const [data, options] = await Promise.all([getItinerary(ctx, id), getLinkOptions(ctx)]);
  if (!data) notFound();
  const { itinerary: it, days, enquiry, quotation, booking } = data;
  const preview = view === "preview";
  const editable = !booking || !["completed", "cancelled"].includes(booking.status);
  return (
    <>
      <PageHeader title={it.name} description={`${it.destination} · ${formatDate(it.start_date)} – ${formatDate(it.end_date)} · ${days.length} day(s)`}
        crumbs={[{ label: "Itineraries", href: "/itineraries" }, { label: it.name }]}
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link href={preview ? `/itineraries/${id}` : `/itineraries/${id}?view=preview`}>{preview ? "Edit mode" : "Preview"}</Link></Button>
            <Button asChild variant="outline" size="sm"><a href={`/api/itineraries/${id}/pdf`} target="_blank" rel="noopener"><Download />PDF</a></Button>
            {!preview && (
              <Dialog>
                <DialogTrigger asChild><Button variant="outline" size="sm">Edit details</Button></DialogTrigger>
                <DialogContent title="Edit itinerary" className="max-w-2xl"><ItineraryForm action={updateItineraryAction} itinerary={it} {...options} /></DialogContent>
              </Dialog>
            )}
            <ConfirmAction action={deleteItineraryAction} hidden={{ id }} title="Delete itinerary?" description="All days and activities will be removed. Linked enquiries, quotations and bookings are not affected." confirmLabel="Delete" triggerLabel="Delete" danger />
          </>
        } />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-4">
        <div className="space-y-4 xl:col-span-3">
          {preview ? (
            <Card><CardBody className="space-y-6">
              {it.notes && <p className="whitespace-pre-wrap text-sm">{it.notes}</p>}
              {days.map((d) => (
                <div key={d.id}>
                  <h3 className="border-b pb-1.5 text-sm font-semibold">Day {d.day_number} · {formatDate(d.day_date)}{d.title ? ` · ${d.title}` : ""}</h3>
                  {d.notes && <p className="mt-2 text-[13px] text-muted-foreground">{d.notes}</p>}
                  <ul className="mt-2 space-y-2">
                    {d.activities.length === 0 && <li className="text-sm text-muted-foreground">Free time / at leisure.</li>}
                    {d.activities.map((a) => (
                      <li key={a.id} className="text-sm"><span className="font-medium">{a.start_time ? `${a.start_time.slice(0, 5)} · ` : ""}{a.title}</span>{a.location ? <span className="text-muted-foreground"> · {a.location}</span> : null}{a.description && <p className="text-[13px] text-muted-foreground">{a.description}</p>}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardBody></Card>
          ) : days.map((d) => <DayEditor key={d.id} day={d} editable={editable} />)}
        </div>
        <Card className="h-fit">
          <CardHeader title="Linked records" />
          <CardBody className="space-y-2 text-sm">
            {enquiry ? <p>Enquiry: <Link href={`/enquiries/${enquiry.id}`} className="text-secondary hover:underline">{enquiry.enquiry_code}</Link>{enquiry.customer ? ` · ${enquiry.customer.full_name}` : ""}</p> : <p className="text-muted-foreground">No enquiry linked</p>}
            {quotation ? <p>Quotation: <Link href={`/quotations/${quotation.id}`} className="text-secondary hover:underline">{quotation.quotation_code}</Link> <StatusBadge status={quotation.status} /></p> : <p className="text-muted-foreground">No quotation linked</p>}
            {booking ? <p>Booking: <Link href={`/bookings/${booking.id}`} className="text-secondary hover:underline">{booking.booking_code}</Link> <StatusBadge status={booking.status} /></p> : <p className="text-muted-foreground">No booking linked</p>}
            <p className="pt-2 text-xs text-muted-foreground">TravelX does not check supplier availability. Confirm services with suppliers before confirming the booking.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
