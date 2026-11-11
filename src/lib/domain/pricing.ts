import { Decimal, money, round2 } from "./money";

export const QUOTATION_ITEM_CATEGORIES = [
  "transportation",
  "accommodation",
  "meals",
  "activities",
  "sightseeing",
  "guide",
  "additional_services",
  "taxes_fees",
  "other",
] as const;
export type QuotationItemCategory = (typeof QUOTATION_ITEM_CATEGORIES)[number];

export const DISCOUNT_TYPES = ["none", "fixed", "percent"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export interface PricingLineInput {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  taxRate: Decimal.Value; // percentage, e.g. 5 for 5%
}

export interface PricedLine {
  subtotal: Decimal;
  tax: Decimal;
  total: Decimal;
}

export interface DiscountInput {
  type: DiscountType;
  value: Decimal.Value;
}

export interface QuotationTotals {
  subtotal: Decimal;
  taxAmount: Decimal;
  discountAmount: Decimal;
  grandTotal: Decimal;
}

export type BudgetStatus = "within_budget" | "at_budget_limit" | "exceeds_budget" | "no_budget";

/**
 * "At budget limit" band: a grand total within the top 5% of the customer's budget
 * (95% < total <= 100% of budget). Below that is within budget; anything above the budget exceeds it.
 */
export const BUDGET_LIMIT_BAND_PERCENT = 5;

export class PricingError extends Error {}

/** Mirrors the generated columns of quotation_items: tax is computed on the rounded line subtotal. */
export function priceLine(line: PricingLineInput): PricedLine {
  const quantity = money(line.quantity);
  const unitPrice = money(line.unitPrice);
  const taxRate = money(line.taxRate);
  if (quantity.lte(0)) throw new PricingError("Quantity must be greater than zero.");
  if (unitPrice.lt(0)) throw new PricingError("Unit price cannot be negative.");
  if (taxRate.lt(0) || taxRate.gt(100)) throw new PricingError("Tax rate must be between 0 and 100%.");
  const subtotal = round2(quantity.times(unitPrice));
  const tax = round2(subtotal.times(taxRate).dividedBy(100));
  return { subtotal, tax, total: subtotal.plus(tax) };
}

/** Discount applies to the pre-tax subtotal and can never exceed it. */
export function calculateDiscount(subtotal: Decimal, discount: DiscountInput): Decimal {
  const value = money(discount.value);
  if (value.lt(0)) throw new PricingError("Discount cannot be negative.");
  let amount: Decimal;
  switch (discount.type) {
    case "none":
      amount = new Decimal(0);
      break;
    case "fixed":
      amount = round2(value);
      break;
    case "percent":
      if (value.gt(100)) throw new PricingError("A percentage discount cannot exceed 100%.");
      amount = round2(subtotal.times(value).dividedBy(100));
      break;
  }
  if (amount.gt(subtotal)) throw new PricingError("Discount cannot exceed the quotation subtotal.");
  return amount;
}

/** Same rules as private.quotation_compute_totals in the database. */
export function calculateQuotationTotals(lines: PricingLineInput[], discount: DiscountInput): QuotationTotals {
  const priced = lines.map(priceLine);
  const subtotal = priced.reduce((acc, l) => acc.plus(l.subtotal), new Decimal(0));
  const taxAmount = priced.reduce((acc, l) => acc.plus(l.tax), new Decimal(0));
  const discountAmount = calculateDiscount(subtotal, discount);
  return { subtotal, taxAmount, discountAmount, grandTotal: subtotal.plus(taxAmount).minus(discountAmount) };
}

export function budgetDifference(budget: Decimal.Value | null | undefined, grandTotal: Decimal.Value): Decimal | null {
  if (budget === null || budget === undefined || budget === "") return null;
  return money(budget).minus(money(grandTotal));
}

export function budgetStatus(budget: Decimal.Value | null | undefined, grandTotal: Decimal.Value): BudgetStatus {
  if (budget === null || budget === undefined || budget === "") return "no_budget";
  const b = money(budget);
  const total = money(grandTotal);
  if (b.lte(0)) return total.gt(0) ? "exceeds_budget" : "at_budget_limit";
  if (total.gt(b)) return "exceeds_budget";
  const threshold = b.times(100 - BUDGET_LIMIT_BAND_PERCENT).dividedBy(100);
  return total.gt(threshold) ? "at_budget_limit" : "within_budget";
}

/** Whether an agent may apply this discount without manager approval. */
export function discountWithinAgentLimit(subtotal: Decimal, discountAmount: Decimal, maxPercent: Decimal.Value): boolean {
  return discountAmount.lte(round2(subtotal.times(money(maxPercent)).dividedBy(100)));
}
