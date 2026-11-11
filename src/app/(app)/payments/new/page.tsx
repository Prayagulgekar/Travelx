import { requireCapability } from "@/lib/auth";
import { todayIso } from "@/lib/validation/common";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PaymentForm } from "@/components/payments/payment-form";
import { listBookingOptions } from "@/features/bookings/queries";

export const metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const ctx = await requireCapability("payments.record");
  const { booking } = await searchParams;
  const options = await listBookingOptions(ctx);
  return (
    <>
      <PageHeader title="Record payment" crumbs={[{ label: "Payments", href: "/payments" }, { label: "Record payment" }]} description="Record money received from a customer against a booking." />
      <Card className="max-w-3xl"><CardBody><PaymentForm bookings={options} initialBooking={booking} today={todayIso()} /></CardBody></Card>
    </>
  );
}
