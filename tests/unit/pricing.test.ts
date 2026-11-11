import { describe, expect, it } from "vitest";
import { budgetDifference, budgetStatus, calculateDiscount, calculateQuotationTotals, discountWithinAgentLimit, priceLine, PricingError } from "@/lib/domain/pricing";
import { Decimal } from "@/lib/domain/money";

const s = (d: Decimal | null) => d?.toFixed(2);

describe("line pricing", () => {
  it("multiplies quantity by unit price and rounds half up to 2dp", () => {
    const l = priceLine({ quantity: "3", unitPrice: "18500.50", taxRate: "5" });
    expect(s(l.subtotal)).toBe("55501.50");
    expect(s(l.tax)).toBe("2775.08"); // 2775.075 rounds up
    expect(s(l.total)).toBe("58276.58");
  });

  it("avoids floating point drift", () => {
    const l = priceLine({ quantity: "3", unitPrice: "0.10", taxRate: "0" });
    expect(s(l.subtotal)).toBe("0.30"); // 0.1*3 in floats is 0.30000000000000004
    const many = calculateQuotationTotals(Array.from({ length: 10 }, () => ({ quantity: "1", unitPrice: "0.10", taxRate: "0" })), { type: "none", value: 0 });
    expect(s(many.subtotal)).toBe("1.00");
  });

  it("rejects zero/negative quantities, negative prices and invalid tax rates", () => {
    expect(() => priceLine({ quantity: "0", unitPrice: "10", taxRate: "0" })).toThrow(PricingError);
    expect(() => priceLine({ quantity: "1", unitPrice: "-1", taxRate: "0" })).toThrow(PricingError);
    expect(() => priceLine({ quantity: "1", unitPrice: "1", taxRate: "101" })).toThrow(PricingError);
  });
});

describe("quotation totals", () => {
  const items = [
    { quantity: "5", unitPrice: "8000.00", taxRate: "12" },
    { quantity: "3", unitPrice: "18500.50", taxRate: "5" },
    { quantity: "3", unitPrice: "2999.99", taxRate: "18" },
  ];

  it("sums subtotal and per-line tax (matches the database engine)", () => {
    const t = calculateQuotationTotals(items, { type: "none", value: 0 });
    expect(s(t.subtotal)).toBe("104501.47");
    expect(s(t.taxAmount)).toBe("9195.07");
    expect(s(t.discountAmount)).toBe("0.00");
    expect(s(t.grandTotal)).toBe("113696.54");
  });

  it("applies a fixed discount: grand total = subtotal + tax - discount", () => {
    const t = calculateQuotationTotals(items, { type: "fixed", value: "3696.54" });
    expect(s(t.grandTotal)).toBe("110000.00");
  });

  it("applies percentage discounts to the pre-tax subtotal", () => {
    const t = calculateQuotationTotals([{ quantity: "2", unitPrice: "1000", taxRate: "5" }, { quantity: "1", unitPrice: "500", taxRate: "0" }], { type: "percent", value: "10" });
    expect(s(t.subtotal)).toBe("2500.00");
    expect(s(t.taxAmount)).toBe("100.00");
    expect(s(t.discountAmount)).toBe("250.00");
    expect(s(t.grandTotal)).toBe("2350.00");
  });

  it("handles an empty quotation", () => {
    const t = calculateQuotationTotals([], { type: "none", value: 0 });
    expect(s(t.grandTotal)).toBe("0.00");
  });
});

describe("discounts", () => {
  it("never exceeds the subtotal and rejects invalid values", () => {
    expect(() => calculateDiscount(new Decimal(100), { type: "fixed", value: "100.01" })).toThrow(/exceed/);
    expect(() => calculateDiscount(new Decimal(100), { type: "percent", value: "101" })).toThrow(/100%/);
    expect(() => calculateDiscount(new Decimal(100), { type: "fixed", value: "-1" })).toThrow(/negative/);
    expect(s(calculateDiscount(new Decimal(100), { type: "fixed", value: "100" }))).toBe("100.00");
    expect(s(calculateDiscount(new Decimal("333.33"), { type: "percent", value: "33.33" }))).toBe("111.10");
  });

  it("checks the travel agent approval limit", () => {
    expect(discountWithinAgentLimit(new Decimal(1000), new Decimal(100), 10)).toBe(true);
    expect(discountWithinAgentLimit(new Decimal(1000), new Decimal("100.01"), 10)).toBe(false);
  });
});

describe("budget comparison", () => {
  it("classifies totals against the customer budget", () => {
    expect(budgetStatus(null, "100")).toBe("no_budget");
    expect(budgetStatus("100000", "95000")).toBe("within_budget"); // exactly 95% is still within
    expect(budgetStatus("100000", "95000.01")).toBe("at_budget_limit");
    expect(budgetStatus("100000", "100000")).toBe("at_budget_limit");
    expect(budgetStatus("100000", "100000.01")).toBe("exceeds_budget");
    expect(budgetStatus("0", "0")).toBe("at_budget_limit");
    expect(budgetStatus("0", "1")).toBe("exceeds_budget");
  });

  it("computes budget difference = budget - grand total", () => {
    expect(s(budgetDifference("150000", "113696.54"))).toBe("36303.46");
    expect(s(budgetDifference("100", "120.50"))).toBe("-20.50");
    expect(budgetDifference(null, "1")).toBeNull();
  });
});
