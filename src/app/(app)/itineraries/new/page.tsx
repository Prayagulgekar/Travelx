import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ItineraryForm } from "@/components/itineraries/itinerary-form";
import { createItineraryAction } from "@/features/itineraries/actions";
import { getLinkOptions } from "@/features/itineraries/options";

export const metadata = { title: "New itinerary" };

export default async function NewItineraryPage({ searchParams }: { searchParams: Promise<{ enquiry?: string; booking?: string; quotation?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const options = await getLinkOptions(ctx);
  let defaults: Record<string, string | null> = {};
  if (sp.booking) {
    const { data } = await ctx.supabase.from("bookings").select("id, destination, departure_date, return_date, enquiry_id, quotation_id").eq("id", sp.booking).maybeSingle();
    if (data) defaults = { name: `${data.destination} itinerary`, destination: data.destination, start_date: data.departure_date, end_date: data.return_date, booking_id: data.id, enquiry_id: data.enquiry_id, quotation_id: data.quotation_id };
  } else if (sp.enquiry) {
    const { data } = await ctx.supabase.from("enquiries").select("id, destination, departure_date, return_date").eq("id", sp.enquiry).maybeSingle();
    if (data) defaults = { name: `${data.destination} itinerary`, destination: data.destination, start_date: data.departure_date, end_date: data.return_date, enquiry_id: data.id };
  }
  return (
    <>
      <PageHeader title="New itinerary" crumbs={[{ label: "Itineraries", href: "/itineraries" }, { label: "New" }]} description="One day is created for every date in the range. Add activities to each day next." />
      <Card className="max-w-3xl"><CardBody><ItineraryForm action={createItineraryAction} defaults={defaults} {...options} /></CardBody></Card>
    </>
  );
}
