import Link from "next/link";
import { Map, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { formatDate, nightsBetween } from "@/lib/format";
import { firstParam, parsePage } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listItineraries } from "@/features/itineraries/queries";

export const metadata = { title: "Itineraries" };

export default async function ItinerariesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const f = { q: firstParam(sp.q), page: parsePage(sp.page) };
  const { rows, total, pageSize } = await listItineraries(ctx, f);
  return (
    <>
      <PageHeader title="Itineraries" description="Day-wise travel plans linked to enquiries, quotations and bookings."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Itineraries" }]} actions={<Button asChild><Link href="/itineraries/new"><Plus />New itinerary</Link></Button>} />
      <Card>
        <FilterBar basePath="/itineraries" search={f.q} searchPlaceholder="Itinerary name or destination" />
        {rows.length === 0 ? <EmptyState icon={Map} title="No itineraries" description="Create a day-wise plan to share with the customer alongside the quotation." action={<Button asChild><Link href="/itineraries/new">New itinerary</Link></Button>} /> : (
          <>
            <Table>
              <THead><tr><TH>Itinerary</TH><TH>Destination</TH><TH>Dates</TH><TH className="hidden md:table-cell">Linked to</TH></tr></THead>
              <TBody>
                {rows.map((i) => (
                  <TR key={i.id}>
                    <TD><Link href={`/itineraries/${i.id}`} className="font-medium hover:text-secondary hover:underline">{i.name}</Link></TD>
                    <TD>{i.destination}</TD>
                    <TD className="whitespace-nowrap">{formatDate(i.start_date)} – {formatDate(i.end_date)} <span className="text-xs text-muted-foreground">({nightsBetween(i.start_date, i.end_date) + 1} days)</span></TD>
                    <TD className="hidden md:table-cell text-[13px] text-muted-foreground">{[i.booking_id && "Booking", i.quotation_id && "Quotation", i.enquiry_id && "Enquiry"].filter(Boolean).join(", ") || "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={f.page} pageSize={pageSize} total={total} basePath="/itineraries" params={{ q: f.q }} />
          </>
        )}
      </Card>
    </>
  );
}
