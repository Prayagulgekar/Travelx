import { getActionContext } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, pdfResponse } from "@/lib/http";
import { renderReceiptPdf } from "@/lib/pdf/documents";
import { getBookingBalance, getPayment } from "@/features/payments/queries";
import { getNameDirectory } from "@/features/team/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getActionContext("payments.view");
    const { id } = await params;
    const data = await getPayment(ctx, id);
    if (!data || !data.payment.customer) throw new NotFoundError();
    const [balance, names] = await Promise.all([getBookingBalance(ctx, data.payment.booking_id), getNameDirectory(ctx)]);
    const net = balance ? (Number(balance.amount_received) - Number(balance.amount_refunded)).toFixed(2) : "0.00";
    const bytes = await renderReceiptPdf(ctx.agency, data.payment, data.payment.booking, data.payment.customer, data.refunds,
      { netCollected: net, outstanding: String(balance?.outstanding ?? "0") }, data.payment.recorded_by ? names.get(data.payment.recorded_by) ?? "-" : "-");
    return pdfResponse(bytes, `receipt-${data.payment.payment_code}.pdf`);
  } catch (error) {
    return errorResponse(error, "pdf.receipt");
  }
}
