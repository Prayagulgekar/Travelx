import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { todayIso } from "@/lib/validation/common";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EnquiryForm } from "@/components/enquiries/enquiry-form";
import { createEnquiryAction } from "@/features/enquiries/actions";
import { getCustomer } from "@/features/customers/queries";
import { getAssignableMembers } from "@/features/team/queries";

export const metadata = { title: "New enquiry" };

export default async function NewEnquiryPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await requireSession();
  const { customer: customerId } = await searchParams;
  const [customer, members] = await Promise.all([customerId ? getCustomer(ctx, customerId) : Promise.resolve(null), getAssignableMembers(ctx)]);
  return (
    <>
      <PageHeader title="New enquiry" crumbs={[{ label: "Enquiries", href: "/enquiries" }, { label: "New enquiry" }]} description="Capture the customer's travel requirements. You can prepare a quotation from the enquiry afterwards." />
      <Card className="max-w-4xl">
        <CardBody>
          <EnquiryForm action={createEnquiryAction} members={members} canAssign={can(ctx.role, "records.reassign")} currency={ctx.agency.currency} today={todayIso()}
            initialCustomer={customer && !customer.archived_at ? { id: customer.id, full_name: customer.full_name, phone: customer.phone, customer_code: customer.customer_code } : null} />
        </CardBody>
      </Card>
    </>
  );
}
