import { z } from "zod";
import { DISCOUNT_TYPES, QUOTATION_ITEM_CATEGORIES } from "@/lib/domain/pricing";
import { isoDate, moneyString, optionalText, requiredText, uuid } from "./common";

export const CATEGORY_LABELS: Record<(typeof QUOTATION_ITEM_CATEGORIES)[number], string> = {
  transportation: "Transportation", accommodation: "Accommodation", meals: "Meals", activities: "Activities",
  sightseeing: "Sightseeing", guide: "Guide charges", additional_services: "Additional services",
  taxes_fees: "Taxes & government fees", other: "Other expenses",
};

const quantityString = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : v),
  z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, "Quantity must be a number with at most 2 decimals.")
    .refine((v) => Number(v) > 0, "Quantity must be greater than zero.")
    .refine((v) => Number(v) <= 100000, "Quantity is too large."),
);
const rateString = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : typeof v === "string" ? (v.trim() === "" ? "0" : v.trim()) : v),
  z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, "Tax rate must be a percentage.").refine((v) => Number(v) <= 100, "Tax rate cannot exceed 100%."),
);

export const quotationItemSchema = z.object({
  category: z.enum(QUOTATION_ITEM_CATEGORIES, { error: "Choose a category." }),
  description: requiredText("Description", 1, 300),
  quantity: quantityString,
  unit_price: moneyString("Unit price"),
  tax_rate: rateString,
});
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;

export const quotationSchema = z.object({
  enquiry_id: uuid("Enquiry"),
  title: requiredText("Title", 2, 160),
  issue_date: isoDate("Issue date"),
  valid_until: isoDate("Valid until"),
  terms: optionalText(5000),
  payment_terms: optionalText(3000),
  internal_notes: optionalText(3000),
  discount_type: z.enum(DISCOUNT_TYPES).default("none"),
  discount_value: moneyString("Discount").default("0"),
  // Client-side totals are intentionally NOT part of the schema; the server never accepts them.
  items: z.array(quotationItemSchema).min(1, "Add at least one line item.").max(200, "A quotation can have at most 200 items."),
}).superRefine((d, ctx) => {
  if (d.valid_until < d.issue_date) {
    ctx.addIssue({ code: "custom", path: ["valid_until"], message: "Validity date must be on or after the issue date." });
  }
  if (d.discount_type === "percent" && Number(d.discount_value) > 100) {
    ctx.addIssue({ code: "custom", path: ["discount_value"], message: "A percentage discount cannot exceed 100%." });
  }
});
export type QuotationInput = z.infer<typeof quotationSchema>;

export const quotationStatusSchema = z.object({
  status: z.enum(["draft", "reviewed", "sent", "accepted", "rejected", "expired"]),
  reason: optionalText(500),
});
