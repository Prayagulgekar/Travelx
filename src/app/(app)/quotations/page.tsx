import Link from "next/link";
import { FileText } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { QUOTATION_STATUSES, statusLabel } from "@/lib/domain/status";
import { budgetStatus } from "@/lib/domain/pricing";
import { formatDate, formatMoney } from "@/lib/format";
import { firstParam, parsePage } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listQuotations } from "@/features/quotations/queries";

export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const f = { q: firstParam(sp.q), status: firstParam(sp.status), from: firstParam(sp.from), to: firstParam(sp.to), page: parsePage(sp.page) };
  const { rows, total, pageSize } = await listQuotations(ctx, f);
  const filtered = Boolean(f.q || f.status || f.from || f.to);
  return (
    <>
      <PageHeader title="Quotations" description="Priced proposals prepared from enquiries. Quotation values are pipeline, not revenue."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Quotations" }]}
        actions={<Button asChild variant="outline"><Link href="/enquiries?status=quotation_in_progress">Enquiries needing quotes</Link></Button>} />
      <Card>
        <FilterBar basePath="/quotations" search={f.q} searchPlaceholder="QUO number or title" dates={{ from: f.from, to: f.to, label: "Issued" }}
          selects={[{ name: "status", label: "Status", value: f.status, options: QUOTATION_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) }]} />
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title={filtered ? "No quotations match these filters" : "No quotations yet"}
            description="Open an enquiry and choose “Prepare quotation” to build a cost breakdown."
            action={<Button asChild><Link href="/enquiries">Go to enquiries</Link></Button>} />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Quotation</TH><TH>Customer</TH><TH className="hidden md:table-cell">Enquiry</TH><TH className="hidden lg:table-cell">Valid until</TH><TH className="text-right">Grand total</TH><TH className="hidden lg:table-cell">Budget</TH><TH>Status</TH></tr></THead>
              <TBody>
                {rows.map((q) => (
                  <TR key={q.id}>
                    <TD><Link href={`/quotations/${q.id}`} className="font-medium hover:text-secondary hover:underline">{q.quotation_code}</Link><div className="max-w-[240px] truncate text-xs text-muted-foreground">{q.title}</div></TD>
                    <TD>{q.customer?.full_name}</TD>
                    <TD className="hidden md:table-cell">{q.enquiry ? <Link href={`/enquiries/${q.enquiry.id}`} className="hover:underline">{q.enquiry.enquiry_code}</Link> : "—"}<div className="text-xs text-muted-foreground">{q.enquiry?.destination}</div></TD>
                    <TD className="hidden lg:table-cell">{formatDate(q.valid_until)}</TD>
                    <TD className="text-right font-medium tabular">{formatMoney(q.grand_total, q.currency)}</TD>
                    <TD className="hidden lg:table-cell"><StatusBadge status={budgetStatus(q.enquiry?.budget ?? null, q.grand_total)} /></TD>
                    <TD><StatusBadge status={q.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={f.page} pageSize={pageSize} total={total} basePath="/quotations" params={{ q: f.q, status: f.status, from: f.from, to: f.to }} />
          </>
        )}
      </Card>
    </>
  );
}
