import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { PAYMENT_METHOD_LABELS, refundableAmount } from "@/lib/domain/payments";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/validation/common";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/shared/detail-list";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getBookingBalance, getPayment } from "@/features/payments/queries";
import { recordRefundAction, updatePaymentStatusAction } from "@/features/payments/actions";
import { getNameDirectory } from "@/features/team/queries";

export const metadata = { title: "Payment" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCapability("payments.view");
  const { id } = await params;
  const data = await getPayment(ctx, id);
  if (!data) notFound();
  const { payment: p, refunds } = data;
  const [names, balance] = await Promise.all([getNameDirectory(ctx), getBookingBalance(ctx, p.booking_id)]);
  const refundable = refundableAmount(p);
  return (
    <>
      <PageHeader title={`Payment ${p.payment_code}`} crumbs={[{ label: "Payments", href: "/payments" }, { label: p.payment_code }]} meta={<StatusBadge status={p.status} />}
        actions={<Button asChild variant="outline" size="sm"><a href={`/api/payments/${id}/receipt`} target="_blank" rel="noopener"><Download />Receipt PDF</a></Button>} />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Payment details" />
            <CardBody>
              <DetailList columns={3} items={[
                { label: "Amount", value: <span className="font-semibold tabular">{formatMoney(p.amount, p.currency)}</span> },
                { label: "Refunded", value: formatMoney(p.refunded_amount, p.currency) },
                { label: "Payment date", value: formatDate(p.payment_date) },
                { label: "Method", value: PAYMENT_METHOD_LABELS[p.method] },
                { label: "Transaction reference", value: p.transaction_reference ?? "—" },
                { label: "Recorded by", value: p.recorded_by ? names.get(p.recorded_by) ?? "—" : "—" },
                { label: "Booking", value: <Link href={`/bookings/${p.booking.id}`} className="text-secondary hover:underline">{p.booking.booking_code} · {p.booking.destination}</Link> },
                { label: "Customer", value: p.customer ? <Link href={`/customers/${p.customer.id}`} className="text-secondary hover:underline">{p.customer.full_name}</Link> : "—" },
                { label: "Recorded at", value: formatDateTime(p.created_at) },
              ]} />
              {p.notes && <p className="mt-4 whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">{p.notes}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Refunds" />
            {refunds.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No refunds recorded against this payment.</p></CardBody> : (
              <Table><THead><tr><TH>Date</TH><TH>Reason</TH><TH>Reference</TH><TH>Recorded by</TH><TH className="text-right">Amount</TH></tr></THead><TBody>
                {refunds.map((r) => <TR key={r.id}><TD>{formatDate(r.refund_date)}</TD><TD>{r.reason}</TD><TD>{r.reference ?? "—"}</TD><TD>{r.recorded_by ? names.get(r.recorded_by) : "—"}</TD><TD className="text-right tabular">{formatMoney(r.amount, p.currency)}</TD></TR>)}
              </TBody></Table>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {p.status === "pending" && can(ctx.role, "payments.record") && (
            <Card><CardHeader title="Pending payment" description="Confirm once the money has cleared." /><CardBody className="flex flex-wrap gap-2">
              <ConfirmAction action={updatePaymentStatusAction} hidden={{ id, status: "received" }} title="Mark as received?" description="The amount will count towards collections and reduce the outstanding balance." confirmLabel="Mark received" triggerLabel="Mark received" triggerVariant="primary" />
              <ConfirmAction action={updatePaymentStatusAction} hidden={{ id, status: "failed" }} title="Mark as failed?" description="Use this if the cheque bounced or the transfer did not arrive. The record is kept for audit." confirmLabel="Mark failed" triggerLabel="Mark failed" danger />
            </CardBody></Card>
          )}
          {balance && (
            <Card><CardHeader title="Booking balance" /><CardBody>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Booking value</dt><dd className="tabular">{formatMoney(balance.total_amount, balance.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Net collected</dt><dd className="tabular">{formatMoney(Number(balance.amount_received) - Number(balance.amount_refunded), balance.currency)}</dd></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><dt>Outstanding</dt><dd className="tabular">{formatMoney(balance.outstanding, balance.currency)}</dd></div>
              </dl>
            </CardBody></Card>
          )}
          {can(ctx.role, "payments.refund") ? (refundable.gt(0) && (
            <Card><CardHeader title="Record a refund" description={`Up to ${formatMoney(refundable.toFixed(2), p.currency)} can be refunded.`} /><CardBody>
              <ConfirmAction action={recordRefundAction} hidden={{ payment_id: id }} title="Record refund" description="Refunds are permanent records and reduce recorded revenue on the refund date." confirmLabel="Record refund" triggerLabel="Record refund" triggerVariant="outline" triggerSize="md" testId="record-refund"
                fields={[
                  { name: "amount", label: `Amount (${p.currency})`, type: "decimal", required: true },
                  { name: "refund_date", label: "Refund date", type: "date", required: true, defaultValue: todayIso() },
                  { name: "reason", label: "Reason", type: "textarea", required: true },
                  { name: "reference", label: "Refund reference" },
                ]} />
            </CardBody></Card>
          )) : <p className="text-xs text-muted-foreground">Refunds can only be recorded by the agency owner.</p>}
        </div>
      </div>
    </>
  );
}
