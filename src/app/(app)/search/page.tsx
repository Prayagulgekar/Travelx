import Link from "next/link";
import { Search } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { globalSearch } from "@/features/search/queries";

export const metadata = { title: "Search" };

const TYPE_LABELS = { customer: "Customer", enquiry: "Enquiry", quotation: "Quotation", booking: "Booking", payment: "Payment" } as const;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireSession();
  const { q = "" } = await searchParams;
  const term = q.trim().slice(0, 80);
  const hits = term.length >= 2 ? await globalSearch(ctx, term) : [];
  return (
    <>
      <PageHeader title={term ? `Results for “${term}”` : "Search"} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Search" }]} />
      <Card>
        {term.length < 2 ? <EmptyState icon={Search} title="Type at least two characters" description="Search by customer name, phone number, ENQ/QUO/BKG/PAY number or destination." /> :
          hits.length === 0 ? <EmptyState icon={Search} title="No matches" description="Check the spelling or search by phone number or record number." /> : (
            <ul className="divide-y">
              {hits.map((h) => (
                <li key={`${h.type}-${h.id}`}>
                  <Link href={h.href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{h.title}</p><p className="text-xs text-muted-foreground">{h.subtitle}</p></div>
                    <span className="flex shrink-0 items-center gap-2">{h.status && <StatusBadge status={h.status} />}<Badge>{TYPE_LABELS[h.type]}</Badge></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </>
  );
}
