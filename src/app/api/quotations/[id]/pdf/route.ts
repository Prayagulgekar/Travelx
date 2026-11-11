import { getActionContext } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, pdfResponse } from "@/lib/http";
import { renderQuotationPdf } from "@/lib/pdf/documents";
import { getQuotation } from "@/features/quotations/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getActionContext();
    const { id } = await params;
    const data = await getQuotation(ctx, id); // RLS: only records the user may see
    if (!data) throw new NotFoundError();
    const bytes = await renderQuotationPdf(ctx.agency, data.quotation, data.items);
    return pdfResponse(bytes, `${data.quotation.quotation_code}.pdf`);
  } catch (error) {
    return errorResponse(error, "pdf.quotation");
  }
}
