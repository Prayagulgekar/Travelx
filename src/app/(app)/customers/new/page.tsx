import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CustomerForm } from "@/components/customers/customer-form";
import { createCustomerAction } from "@/features/customers/actions";
import { getAssignableMembers } from "@/features/team/queries";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const ctx = await requireSession();
  const members = await getAssignableMembers(ctx);
  return (
    <>
      <PageHeader title="Add customer" crumbs={[{ label: "Customers", href: "/customers" }, { label: "Add customer" }]}
        description="We check phone numbers and emails to avoid duplicate customer records." />
      <Card className="max-w-3xl"><CardBody><CustomerForm action={createCustomerAction} members={members} canAssign={can(ctx.role, "records.reassign")} /></CardBody></Card>
    </>
  );
}
