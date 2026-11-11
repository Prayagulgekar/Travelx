import Link from "next/link";
import { Plus, UserSquare2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { firstParam, parsePage } from "@/lib/utils";
import { CUSTOMER_SOURCES, CUSTOMER_SOURCE_LABELS } from "@/lib/validation/customers";
import { can } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listCustomers } from "@/features/customers/queries";
import { getAssignableMembers, getNameDirectory } from "@/features/team/queries";

export const metadata = { title: "Customers" };

type SP = Record<string, string | string[] | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const filters = {
    q: firstParam(sp.q), source: firstParam(sp.source), assigned: firstParam(sp.assigned),
    archived: firstParam(sp.archived) as "only" | "include" | undefined, page: parsePage(sp.page),
  };
  const [{ rows, total, pageSize }, names, members] = await Promise.all([listCustomers(ctx, filters), getNameDirectory(ctx), getAssignableMembers(ctx)]);
  const selects = [
    { name: "source", label: "Source", value: filters.source, options: CUSTOMER_SOURCES.map((s) => ({ value: s, label: CUSTOMER_SOURCE_LABELS[s] })) },
    ...(can(ctx.role, "records.view_all") ? [{ name: "assigned", label: "Owner", value: filters.assigned, options: members }] : []),
    { name: "archived", label: "Archived", value: filters.archived, options: [{ value: "include", label: "Include archived" }, { value: "only", label: "Archived only" }] },
  ];
  return (
    <>
      <PageHeader title="Customers" description="Every traveller and contact your agency works with." crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Customers" }]}
        actions={<Button asChild><Link href="/customers/new"><Plus />Add customer</Link></Button>} />
      <Card>
        <FilterBar basePath="/customers" search={filters.q} searchPlaceholder="Name, phone, email, CUS number or city" selects={selects} />
        {rows.length === 0 ? (
          <EmptyState icon={UserSquare2} title={filters.q || filters.source ? "No customers match these filters" : "No customers yet"}
            description={filters.q ? "Try a different name or phone number." : "Add your first customer to start recording enquiries."}
            action={<Button asChild><Link href="/customers/new">Add customer</Link></Button>} />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Customer</TH><TH>Contact</TH><TH className="hidden md:table-cell">Location</TH><TH className="hidden lg:table-cell">Source</TH><TH className="hidden lg:table-cell">Owner</TH><TH>Added</TH></tr></THead>
              <TBody>
                {rows.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/customers/${c.id}`} className="font-medium text-foreground hover:text-secondary hover:underline">{c.full_name}</Link>
                      <div className="text-xs text-muted-foreground">{c.customer_code}{c.archived_at && <Badge className="ml-2">Archived</Badge>}</div>
                    </TD>
                    <TD><div className="tabular">{c.phone}</div><div className="text-xs text-muted-foreground">{c.email ?? "No email"}</div></TD>
                    <TD className="hidden md:table-cell">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</TD>
                    <TD className="hidden lg:table-cell">{c.source ? CUSTOMER_SOURCE_LABELS[c.source as keyof typeof CUSTOMER_SOURCE_LABELS] : "—"}</TD>
                    <TD className="hidden lg:table-cell">{c.assigned_to ? names.get(c.assigned_to) ?? "—" : "—"}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(c.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={filters.page} pageSize={pageSize} total={total} basePath="/customers" params={{ q: filters.q, source: filters.source, assigned: filters.assigned, archived: filters.archived }} />
          </>
        )}
      </Card>
    </>
  );
}
