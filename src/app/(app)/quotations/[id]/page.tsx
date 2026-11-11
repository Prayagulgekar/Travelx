import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Download, Pencil } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { money } from "@/lib/domain/money";
import { budgetDifference, budgetStatus } from "@/lib/domain/pricing";
import { formatDate, formatDateTime, formatMoney, travellerSummary } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/validation/quotations";
import { isEmailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/shared/detail-list";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { ActivityTimeline } from "@/components/shared/timeline";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getQuotation } from "@/features/quotations/queries";
import { changeQuotationStatusAction, convertToBookingAction, deleteQuotationAction, duplicateQuotationAction, emailQuotationAction } from "@/features/quotations/actions";
import { getNameDirectory } from "@/features/team/queries";
import { getActivity } from "@/features/shared-queries";

export const metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const data = await getQuotation(ctx, id);
  if (!data) notFound();
  const { quotation: q, items, booking } = data;
  const [names, activity] = await Promise.all([getNameDirectory(ctx), getActivity(ctx, id, false, 30)]);
  const e = q.enquiry;
  const cur = q.currency;
  const bStatus = budgetStatus(e?.budget ?? null, q.grand_total);
  const diff = budgetDifference(e?.budget ?? null, q.grand_total);
  const expiredByDate = q.valid_until < new Date().toISOString().slice(0, 10);
  const emailReady = isEmailConfigured();
  const status = (s: string, label: string, opts: { danger?: boolean; desc: string; reason?: boolean; variant?: "primary" | "outline" } ) => (
    <ConfirmAction key={s} action={changeQuotationStatusAction} hidden={{ id, status: s }} title={`${label}?`} description={opts.desc} confirmLabel={label}
      triggerLabel={label} danger={opts.danger} triggerVariant={opts.variant ?? "outline"} testId={`quotation-${s}`}
      fields={opts.reason ? [{ name: "reason", label: "Reason (optional)", type: "textarea" }] : undefined} />
  );

  return (
    <>
      <PageHeader title={q.title} crumbs={[{ label: "Quotations", href: "/quotations" }, { label: q.quotation_code }]}
        meta={<StatusBadge status={q.status} />}
        actions={
          <>
            <Button asChild variant="outline" size="sm"><a href={`/api/quotations/${id}/pdf`} target="_blank" rel="noopener"><Download />PDF</a></Button>
            <ConfirmAction action={duplicateQuotationAction} hidden={{ id }} title="Duplicate quotation?" description="A new draft with the same line items will be created. This quotation is not changed."
              confirmLabel="Duplicate" triggerLabel={<><Copy className="size-4" />Duplicate</>} />
            {q.status === "draft" && <Button asChild variant="outline" size="sm"><Link href={`/quotations/${id}/edit`}><Pencil />Edit</Link></Button>}
            {q.status === "draft" && (
              <ConfirmAction action={deleteQuotationAction} hidden={{ id, enquiry_id: q.enquiry_id }} title="Delete this draft?" description="The draft and its line items will be permanently removed." confirmLabel="Delete draft" triggerLabel="Delete" danger />
            )}
          </>
        } />

      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Cost breakdown" description={`${items.length} line item${items.length === 1 ? "" : "s"}`} />
            {items.length === 0 ? <CardBody><p className="text-sm text-muted-foreground">No line items yet. Edit the draft to add costs.</p></CardBody> : (
              <Table>
                <THead><tr><TH>Description</TH><TH className="hidden sm:table-cell">Category</TH><TH className="text-right">Qty</TH><TH className="text-right">Unit price</TH><TH className="text-right">Tax</TH><TH className="text-right">Amount</TH></tr></THead>
                <TBody>
                  {items.map((i) => (
                    <TR key={i.id}>
                      <TD>{i.description}</TD><TD className="hidden sm:table-cell text-muted-foreground">{CATEGORY_LABELS[i.category]}</TD>
                      <TD className="text-right tabular">{money(i.quantity).toString()}</TD><TD className="text-right tabular">{formatMoney(i.unit_price, cur)}</TD>
                      <TD className="text-right tabular text-muted-foreground">{money(i.tax_rate).toString()}%</TD><TD className="text-right font-medium tabular">{formatMoney(i.line_total, cur)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <CardBody className="border-t">
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular" data-testid="q-subtotal">{formatMoney(q.subtotal, cur)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Taxes</dt><dd className="tabular" data-testid="q-tax">{formatMoney(q.tax_amount, cur)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discount{q.discount_type === "percent" ? ` (${money(q.discount_value).toString()}%)` : ""}</dt><dd className="tabular" data-testid="q-discount">− {formatMoney(q.discount_amount, cur)}</dd></div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Grand total</dt><dd className="tabular" data-testid="q-total">{formatMoney(q.grand_total, cur)}</dd></div>
              </dl>
            </CardBody>
          </Card>
          {(q.payment_terms || q.terms) && (
            <Card><CardHeader title="Terms" /><CardBody className="space-y-3 text-sm">
              {q.payment_terms && <div><p className="text-xs text-muted-foreground">Payment terms</p><p className="mt-0.5 whitespace-pre-wrap">{q.payment_terms}</p></div>}
              {q.terms && <div><p className="text-xs text-muted-foreground">Terms and conditions</p><p className="mt-0.5 whitespace-pre-wrap">{q.terms}</p></div>}
            </CardBody></Card>
          )}
          <Card><CardHeader title="History" /><CardBody><ActivityTimeline logs={activity} names={names} /></CardBody></Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Workflow" description="Draft → Reviewed → Sent → Accepted / Rejected / Expired" />
            <CardBody className="space-y-3">
              {q.status === "draft" && (can(ctx.role, "quotations.review")
                ? status("reviewed", "Mark as reviewed", { desc: "Reviewed quotations are locked for editing and ready to send.", variant: "primary" })
                : <p className="text-sm text-muted-foreground">An owner or administrator needs to review this quotation before it can be sent.</p>)}
              {q.status === "reviewed" && (
                <div className="flex flex-wrap gap-2">
                  {status("sent", "Mark as sent", { desc: "Use this after you have shared the quotation with the customer yourself (e.g. WhatsApp or in person).", variant: "primary" })}
                  {status("draft", "Back to draft", { desc: "The quotation becomes editable again and must be reviewed again." })}
                </div>
              )}
              {(q.status === "reviewed" || q.status === "sent") && (
                emailReady ? (
                  q.customer?.email ? (
                    <ConfirmAction action={emailQuotationAction} hidden={{ id }} title="Email quotation PDF?" description={`The PDF will be emailed to ${q.customer.email}${q.status === "reviewed" ? " and the quotation marked as sent" : ""}.`} confirmLabel="Send email" triggerLabel="Email to customer" />
                  ) : <p className="text-xs text-muted-foreground">Add an email address to the customer to email this quotation.</p>
                ) : <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Email sending is not configured. Download the PDF and share it manually, then mark the quotation as sent.</p>
              )}
              {q.status === "sent" && (
                <div className="flex flex-wrap gap-2">
                  {expiredByDate ? <p className="w-full text-xs text-warning">The validity date has passed. It can no longer be accepted.</p>
                    : status("accepted", "Mark as accepted", { desc: "Prices are frozen in a snapshot. You can then convert it into a booking.", variant: "primary" })}
                  {status("rejected", "Mark as rejected", { desc: "The customer declined this quotation.", danger: true, reason: true })}
                  {status("expired", "Mark as expired", { desc: "The quotation is no longer valid." })}
                </div>
              )}
              {q.status === "accepted" && (booking ? (
                <p className="text-sm">Converted to booking <Link href={`/bookings/${booking.id}`} className="font-medium text-secondary hover:underline">{booking.booking_code}</Link>.</p>
              ) : (
                <ConfirmAction action={convertToBookingAction} hidden={{ id }} title="Convert to booking?" description={`A booking for ${formatMoney(q.grand_total, cur)} will be created from the accepted price snapshot.`}
                  confirmLabel="Create booking" triggerLabel="Convert to booking" triggerVariant="primary" triggerSize="md" testId="convert-booking"
                  fields={[{ name: "notes", label: "Booking notes (optional)", type: "textarea" }]} />
              ))}
              {(q.status === "rejected" || q.status === "expired") && <p className="text-sm text-muted-foreground">Closed. Duplicate it to issue a revised quotation.{q.rejection_reason ? ` Reason: ${q.rejection_reason}` : ""}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Customer budget" />
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Budget</span><span className="tabular">{e?.budget != null ? formatMoney(e.budget, cur) : "Not given"}</span></div>
              {diff && <div className="flex justify-between"><span className="text-muted-foreground">Difference</span><span className={`tabular ${diff.lt(0) ? "text-danger" : "text-success"}`}>{formatMoney(diff.toFixed(2), cur)}</span></div>}
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={bStatus} /></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList columns={1} items={[
                { label: "Customer", value: q.customer ? <Link className="text-secondary hover:underline" href={`/customers/${q.customer.id}`}>{q.customer.full_name}</Link> : "—" },
                { label: "Enquiry", value: e ? <Link className="text-secondary hover:underline" href={`/enquiries/${e.id}`}>{e.enquiry_code} · {e.destination}</Link> : "—" },
                { label: "Travel", value: e ? `${formatDate(e.departure_date)} – ${formatDate(e.return_date)} · ${travellerSummary(e.adults, e.children, e.infants)}` : "—" },
                { label: "Issued / valid until", value: `${formatDate(q.issue_date)} / ${formatDate(q.valid_until)}` },
                { label: "Prepared by", value: q.created_by ? names.get(q.created_by) ?? "—" : "—" },
                ...(q.reviewed_at ? [{ label: "Reviewed", value: formatDateTime(q.reviewed_at) }] : []),
                ...(q.accepted_at ? [{ label: "Accepted", value: formatDateTime(q.accepted_at) }] : []),
                ...(q.internal_notes ? [{ label: "Internal notes", value: q.internal_notes }] : []),
              ]} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
