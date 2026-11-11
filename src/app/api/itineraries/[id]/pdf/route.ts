import { getActionContext } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, pdfResponse } from "@/lib/http";
import { renderItineraryPdf } from "@/lib/pdf/documents";
import { getItinerary } from "@/features/itineraries/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getActionContext();
    const { id } = await params;
    const data = await getItinerary(ctx, id);
    if (!data) throw new NotFoundError();
    const bytes = await renderItineraryPdf(ctx.agency, data.itinerary, data.days, data.enquiry?.customer?.full_name);
    return pdfResponse(bytes, `itinerary-${data.itinerary.name}.pdf`);
  } catch (error) {
    return errorResponse(error, "pdf.itinerary");
  }
}
