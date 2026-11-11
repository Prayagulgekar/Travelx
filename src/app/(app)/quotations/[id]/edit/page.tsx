import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { money } from "@/lib/domain/money";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { QuotationBuilder } from "@/components/quotations/quotation-builder";
import { getQuotation } from "@/features/quotations/queries";
import { agentLimit, builderEnquiry, builderItems } from "@/features/quotations/builder-data";
import type { Enquiry } from "@/types/models";

export const metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const data = await getQuotation(ctx, id);
  if (!data || !data.quotation.enquiry) notFound();
  const { quotation: q, items } = data;
  const crumbs = [{ label: "Quotations", href: "/quotations" }, { label: q.quotation_code, href: `/quotations/${id}` }, { label: "Edit" }];
  if (q.status !== "draft") {
    return <PageHeader title="This quotation is locked" description="Only drafts can be edited. Move a reviewed quotation back to draft, or duplicate a sent one." crumbs={crumbs} />;
  }
  return (
    <>
      <PageHeader title={`Edit ${q.quotation_code}`} crumbs={crumbs} />
      <Card><CardBody>
        <QuotationBuilder quotationId={id} enquiry={builderEnquiry(q.enquiry as unknown as Enquiry & { enquiry_code: string })} defaultTaxRate={money(ctx.agency.default_tax_rate).toString()} agentDiscountLimit={agentLimit(ctx)}
          initial={{
            title: q.title, issue_date: q.issue_date, valid_until: q.valid_until, terms: q.terms ?? "", payment_terms: q.payment_terms ?? "",
            internal_notes: q.internal_notes ?? "", discount_type: q.discount_type, discount_value: money(q.discount_value).toString(), items: builderItems(items),
          }} />
      </CardBody></Card>
    </>
  );
}
