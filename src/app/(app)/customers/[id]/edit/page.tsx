import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CustomerForm } from "@/components/customers/customer-form";
import { updateCustomerAction } from "@/features/customers/actions";
import { getCustomer } from "@/features/customers/queries";
import { getAssignableMembers } from "@/features/team/queries";

export const metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const [customer, members] = await Promise.all([getCustomer(ctx, id), getAssignableMembers(ctx)]);
  if (!customer) notFound();
  if (customer.archived_at) {
    return <PageHeader title="Archived customer" description="Restore this customer before editing their details." crumbs={[{ label: "Customers", href: "/customers" }, { label: customer.full_name, href: `/customers/${id}` }]} />;
  }
  return (
    <>
      <PageHeader title={`Edit ${customer.full_name}`} crumbs={[{ label: "Customers", href: "/customers" }, { label: customer.full_name, href: `/customers/${id}` }, { label: "Edit" }]} />
      <Card className="max-w-3xl"><CardBody><CustomerForm action={updateCustomerAction} customer={customer} members={members} canAssign={can(ctx.role, "records.reassign")} /></CardBody></Card>
    </>
  );
}
