import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { ENQUIRY_STATUSES, statusLabel } from "@/lib/domain/status";
import { formatDate, formatMoney, travellerSummary } from "@/lib/format";
import { firstParam, parsePage } from "@/lib/utils";
import { PRIORITIES } from "@/lib/validation/enquiries";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listEnquiries } from "@/features/enquiries/queries";
import { getAssignableMembers, getNameDirectory } from "@/features/team/queries";

export const metadata = { title: "Enquiries" };

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const f = {
    q: firstParam(sp.q), status: firstParam(sp.status), assigned: firstParam(sp.assigned), priority: firstParam(sp.priority),
    destination: firstParam(sp.destination), from: firstParam(sp.from), to: firstParam(sp.to), page: parsePage(sp.page),
  };
  const [{ rows, total, pageSize }, names, members] = await Promise.all([listEnquiries(ctx, f), getNameDirectory(ctx), getAssignableMembers(ctx)]);
  const filtered = Boolean(f.q || f.status || f.assigned || f.priority || f.from || f.to);
  return (
    <>
      <PageHeader title="Enquiries" description={ctx.role === "agent" ? "Enquiries assigned to you or created by you." : "All travel enquiries received by your agency."}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Enquiries" }]}
        actions={<Button asChild><Link href="/enquiries/new"><Plus />New enquiry</Link></Button>} />
      <Card>
        <FilterBar basePath="/enquiries" search={f.q} searchPlaceholder="ENQ number, destination or origin"
          dates={{ from: f.from, to: f.to, label: "Departing" }}
          selects={[
            { name: "status", label: "Status", value: f.status, options: ENQUIRY_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) },
            { name: "priority", label: "Priority", value: f.priority, options: PRIORITIES.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) })) },
            ...(can(ctx.role, "records.view_all") ? [{ name: "assigned", label: "Agent", value: f.assigned, options: [{ value: "unassigned", label: "Unassigned" }, ...members] }] : []),
          ]} />
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title={filtered ? "No enquiries match these filters" : "No enquiries yet"}
            description={filtered ? "Clear the filters or try another search." : "Record a customer's travel requirements to start the quotation process."}
            action={<Button asChild><Link href="/enquiries/new">New enquiry</Link></Button>} />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Enquiry</TH><TH>Customer</TH><TH>Trip</TH><TH className="hidden lg:table-cell">Travellers</TH><TH className="hidden md:table-cell text-right">Budget</TH><TH className="hidden xl:table-cell">Agent</TH><TH>Status</TH></tr></THead>
              <TBody>
                {rows.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/enquiries/${e.id}`} className="font-medium hover:text-secondary hover:underline">{e.enquiry_code}</Link>
                      <div className="mt-0.5"><StatusBadge status={e.priority} /></div>
                    </TD>
                    <TD><div className="font-medium">{e.customer?.full_name}</div><div className="text-xs text-muted-foreground tabular">{e.customer?.phone}</div></TD>
                    <TD><div>{e.source_location} → {e.destination}</div><div className="text-xs text-muted-foreground">{formatDate(e.departure_date)} – {formatDate(e.return_date)}</div></TD>
                    <TD className="hidden lg:table-cell text-[13px]">{travellerSummary(e.adults, e.children, e.infants)}</TD>
                    <TD className="hidden md:table-cell text-right tabular">{e.budget != null ? formatMoney(e.budget, e.currency) : "—"}</TD>
                    <TD className="hidden xl:table-cell">{e.assigned_to ? names.get(e.assigned_to) ?? "—" : <span className="text-muted-foreground">Unassigned</span>}</TD>
                    <TD><StatusBadge status={e.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={f.page} pageSize={pageSize} total={total} basePath="/enquiries" params={{ q: f.q, status: f.status, assigned: f.assigned, priority: f.priority, from: f.from, to: f.to }} />
          </>
        )}
      </Card>
    </>
  );
}
