import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { isEmailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgencySettingsForm } from "@/components/settings/settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireSession();
  const owner = can(ctx.role, "agency.manage");
  const email = isEmailConfigured();
  const integrations = [
    { name: "Transactional email (Resend)", configured: email, detail: email ? "Quotations can be emailed as PDF attachments." : "Set RESEND_API_KEY and EMAIL_FROM to email quotations. Until then, download PDFs and share them manually." },
    { name: "WhatsApp Business", configured: false, detail: "Not integrated. Share PDFs via WhatsApp manually." },
    { name: "Payment gateway", configured: false, detail: "Not integrated. Payments are recorded manually; card payments are not processed by TravelX." },
    { name: "Supplier inventory (hotels, transport)", configured: false, detail: "Not integrated. TravelX does not check or claim supplier availability." },
  ];
  return (
    <>
      <PageHeader title="Settings" description={owner ? "Agency details used on quotations, itineraries and receipts." : "Only the agency owner can change these settings."}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]} />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader title="Agency profile and defaults" /><CardBody><AgencySettingsForm agency={ctx.agency} readOnly={!owner} /></CardBody></Card>
        <Card className="h-fit">
          <CardHeader title="Integrations" description="External services TravelX can work with" />
          <CardBody className="space-y-4">
            {integrations.map((i) => (
              <div key={i.name}>
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{i.name}</p><Badge tone={i.configured ? "success" : "neutral"}>{i.configured ? "Configured" : "Not configured"}</Badge></div>
                <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
