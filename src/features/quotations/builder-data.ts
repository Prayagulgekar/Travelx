import "server-only";
import { money } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import type { SessionContext } from "@/lib/auth";
import type { Enquiry, QuotationItem } from "@/types/models";
import type { BuilderItem } from "@/components/quotations/quotation-builder";

export function builderEnquiry(e: Pick<Enquiry, "id" | "enquiry_code" | "destination" | "budget" | "currency" | "departure_date" | "return_date" | "adults" | "children" | "infants" | "rooms">) {
  return {
    id: e.id, enquiry_code: e.enquiry_code, destination: e.destination, budget: e.budget, currency: e.currency,
    nights: Math.round((Date.parse(e.return_date) - Date.parse(e.departure_date)) / 86_400_000),
    travellers: e.adults + e.children + e.infants, rooms: e.rooms,
  };
}

export function builderItems(items: QuotationItem[]): BuilderItem[] {
  return items.map((i) => ({
    key: i.id, category: i.category, description: i.description,
    quantity: money(i.quantity).toString(), unit_price: money(i.unit_price).toFixed(2), tax_rate: money(i.tax_rate).toString(),
  }));
}

export function agentLimit(ctx: SessionContext): string | null {
  return can(ctx.role, "quotations.discount_unlimited") ? null : money(ctx.agency.max_agent_discount_percent).toString();
}
