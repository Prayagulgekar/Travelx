import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { isEnquiryClosed } from "@/lib/domain/status";
import { todayIso } from "@/lib/validation/common";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EnquiryForm } from "@/components/enquiries/enquiry-form";
import { updateEnquiryAction } from "@/features/enquiries/actions";
import { getEnquiry } from "@/features/enquiries/queries";
import { getAssignableMembers } from "@/features/team/queries";

export const metadata = { title: "Edit enquiry" };

export default async function EditEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const [enquiry, members] = await Promise.all([getEnquiry(ctx, id), getAssignableMembers(ctx)]);
  if (!enquiry) notFound();
  const crumbs = [{ label: "Enquiries", href: "/enquiries" }, { label: enquiry.enquiry_code, href: `/enquiries/${id}` }, { label: "Edit" }];
  if (isEnquiryClosed(enquiry.status)) return <PageHeader title="Enquiry is closed" description="Converted and cancelled enquiries are read-only." crumbs={crumbs} />;
  return (
    <>
      <PageHeader title={`Edit ${enquiry.enquiry_code}`} crumbs={crumbs} />
      <Card className="max-w-4xl"><CardBody>
        <EnquiryForm action={updateEnquiryAction} enquiry={enquiry} members={members} canAssign={can(ctx.role, "records.reassign")} currency={enquiry.currency} today={todayIso()}
          initialCustomer={enquiry.customer ? { id: enquiry.customer.id, full_name: enquiry.customer.full_name, phone: enquiry.customer.phone, customer_code: enquiry.customer.customer_code } : null} />
      </CardBody></Card>
    </>
  );
}
