import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { todayIso } from "@/lib/validation/common";
import { money } from "@/lib/domain/money";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { QuotationBuilder } from "@/components/quotations/quotation-builder";
import { getEnquiry } from "@/features/enquiries/queries";
import { agentLimit, builderEnquiry } from "@/features/quotations/builder-data";

export const metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ enquiry?: string }> }) {
  const ctx = await requireSession();
  const { enquiry: enquiryId } = await searchParams;
  if (!enquiryId) redirect("/enquiries");
  const enquiry = await getEnquiry(ctx, enquiryId);
  if (!enquiry) notFound();
  const today = todayIso();
  const valid = new Date(Date.now() + ctx.agency.quotation_validity_days * 86_400_000);
  const nights = enquiry.duration_nights;
  const taxRate = money(ctx.agency.default_tax_rate).toString();
  return (
    <>
      <PageHeader title="New quotation" description={`For ${enquiry.customer?.full_name} · ${enquiry.destination}`}
        crumbs={[{ label: "Enquiries", href: "/enquiries" }, { label: enquiry.enquiry_code, href: `/enquiries/${enquiry.id}` }, { label: "New quotation" }]} />
      {["converted", "lost", "cancelled"].includes(enquiry.status) ? (
        <Card><CardBody><p className="text-sm">Quotations cannot be created for an enquiry that is {enquiry.status}.</p></CardBody></Card>
      ) : (
        <Card><CardBody>
          <QuotationBuilder enquiry={builderEnquiry(enquiry)} defaultTaxRate={taxRate} agentDiscountLimit={agentLimit(ctx)}
            initial={{
              title: `${enquiry.destination} · ${nights} night${nights === 1 ? "" : "s"}`, issue_date: today, valid_until: todayIso(valid),
              terms: ctx.agency.quotation_terms ?? "", payment_terms: ctx.agency.payment_terms ?? "", internal_notes: "",
              discount_type: "none", discount_value: "0",
              items: [{ key: "init-1", category: "accommodation", description: "", quantity: String(Math.max(nights, 1) * enquiry.rooms), unit_price: "", tax_rate: taxRate }],
            }} />
        </CardBody></Card>
      )}
    </>
  );
}
