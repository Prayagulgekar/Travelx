import { describe, expect, it } from "vitest";
import { customerSchema, normalizePhone } from "@/lib/validation/customers";
import { enquiryCreateSchema, enquiryStatusSchema } from "@/lib/validation/enquiries";
import { quotationSchema } from "@/lib/validation/quotations";
import { paymentSchema, refundSchema } from "@/lib/validation/payments";
import { signupSchema } from "@/lib/validation/misc";
import { fieldErrors, todayIso } from "@/lib/validation/common";

const day = (offset: number) => todayIso(new Date(Date.now() + offset * 86_400_000));
const uuid = "6f1c2b9e-4f2a-4a8e-9c1d-2b3a4c5d6e7f";

const enquiry = (o: Record<string, unknown> = {}) => ({
  customer_id: uuid, source_location: "Mumbai", destination: "Bali", departure_date: day(10), return_date: day(15),
  adults: "2", children: "1", infants: "0", rooms: "1", budget: "150000", currency: "INR", priority: "medium", idempotency_key: uuid, ...o,
});

function errorsOf(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) {
  const r = schema.safeParse(value);
  return r.success ? {} : fieldErrors(r.error as never);
}

describe("customer validation", () => {
  it("accepts valid input and optional email", () => {
    expect(customerSchema.safeParse({ full_name: "Asha Rao", phone: "+91 98200 12345", email: "" }).success).toBe(true);
  });
  it("rejects bad phone and email formats and missing names", () => {
    expect(errorsOf(customerSchema, { full_name: "A", phone: "123", email: "x@" })).toMatchObject({ full_name: expect.any(String), phone: expect.any(String), email: expect.any(String) });
    expect(errorsOf(customerSchema, { full_name: "Asha", phone: "98-20 abc" }).phone).toBeTruthy();
  });
  it("normalises phone numbers for duplicate detection", () => {
    expect(normalizePhone("+91 (982) 001-2345")).toBe("+919820012345");
    expect(normalizePhone("098200 12345")).toBe("09820012345");
  });
});

describe("enquiry validation", () => {
  it("accepts a valid enquiry", () => {
    expect(enquiryCreateSchema.safeParse(enquiry()).success).toBe(true);
  });
  it("validates date ranges", () => {
    expect(errorsOf(enquiryCreateSchema, enquiry({ return_date: day(5) })).return_date).toMatch(/on or after/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ departure_date: day(-1), return_date: day(2) })).departure_date).toMatch(/past/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ departure_date: "2026-02-30" })).departure_date).toMatch(/valid date/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ return_date: day(500) })).return_date).toMatch(/longer than a year/);
  });
  it("validates traveller counts", () => {
    expect(errorsOf(enquiryCreateSchema, enquiry({ adults: "0" })).adults).toMatch(/at least 1/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ children: "-1" })).children).toBeTruthy();
    expect(errorsOf(enquiryCreateSchema, enquiry({ adults: "1", infants: "3" })).infants).toMatch(/two infants/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ adults: "1", children: "0", rooms: "2" })).rooms).toBeTruthy();
    expect(errorsOf(enquiryCreateSchema, enquiry({ adults: "1.5" })).adults).toMatch(/whole number/);
  });
  it("validates budget and destination", () => {
    expect(errorsOf(enquiryCreateSchema, enquiry({ budget: "-100" })).budget).toMatch(/negative/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ budget: "12.345" })).budget).toBeTruthy();
    expect(enquiryCreateSchema.safeParse(enquiry({ budget: "" })).success).toBe(true);
    expect(errorsOf(enquiryCreateSchema, enquiry({ destination: "" })).destination).toMatch(/required/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ destination: "1234" })).destination).toMatch(/place name/);
    expect(errorsOf(enquiryCreateSchema, enquiry({ destination: "mumbai" })).destination).toMatch(/differ/);
  });
  it("requires a reason when an enquiry is lost", () => {
    expect(enquiryStatusSchema.safeParse({ status: "lost" }).success).toBe(false);
    expect(enquiryStatusSchema.safeParse({ status: "lost", reason: "Price" }).success).toBe(true);
  });
});

describe("quotation validation", () => {
  const base = { enquiry_id: uuid, title: "Bali", issue_date: day(0), valid_until: day(14), discount_type: "none", discount_value: "0",
    items: [{ category: "meals", description: "Dinner", quantity: "2", unit_price: "1000", tax_rate: "5" }] };
  it("requires items and valid validity dates", () => {
    expect(quotationSchema.safeParse(base).success).toBe(true);
    expect(errorsOf(quotationSchema, { ...base, items: [] }).items).toMatch(/at least one/);
    expect(errorsOf(quotationSchema, { ...base, valid_until: day(-1) }).valid_until).toBeTruthy();
  });
  it("rejects negative prices, zero quantities and >100% discounts", () => {
    expect(errorsOf(quotationSchema, { ...base, items: [{ ...base.items[0], unit_price: "-1" }] })["items.0.unit_price"]).toBeTruthy();
    expect(errorsOf(quotationSchema, { ...base, items: [{ ...base.items[0], quantity: "0" }] })["items.0.quantity"]).toBeTruthy();
    expect(errorsOf(quotationSchema, { ...base, discount_type: "percent", discount_value: "120" }).discount_value).toBeTruthy();
  });
  it("does not accept client totals into the parsed data", () => {
    const r = quotationSchema.parse({ ...base, grand_total: "1" });
    expect(r).not.toHaveProperty("grand_total");
  });
});

describe("payment validation", () => {
  const base = { booking_id: uuid, amount: "1000.00", method: "upi", transaction_reference: "UTR1", payment_date: day(0), status: "received", idempotency_key: uuid };
  it("rejects zero, negative and future payments and requires references for non-cash", () => {
    expect(paymentSchema.safeParse(base).success).toBe(true);
    expect(errorsOf(paymentSchema, { ...base, amount: "0" }).amount).toBeTruthy();
    expect(errorsOf(paymentSchema, { ...base, amount: "-5" }).amount).toBeTruthy();
    expect(errorsOf(paymentSchema, { ...base, payment_date: day(5) }).payment_date).toMatch(/future/);
    expect(errorsOf(paymentSchema, { ...base, transaction_reference: "" }).transaction_reference).toBeTruthy();
    expect(paymentSchema.safeParse({ ...base, method: "cash", transaction_reference: "" }).success).toBe(true);
  });
  it("requires a reason and positive amount for refunds", () => {
    expect(refundSchema.safeParse({ payment_id: uuid, amount: "10", refund_date: day(0), reason: "" }).success).toBe(false);
    expect(refundSchema.safeParse({ payment_id: uuid, amount: "0", refund_date: day(0), reason: "Changed plans" }).success).toBe(false);
  });
});

describe("sign-up validation", () => {
  it("enforces password strength", () => {
    expect(signupSchema.safeParse({ full_name: "Ravi", agency_name: "Sun Travels", email: "r@x.in", password: "short1" }).success).toBe(false);
    expect(signupSchema.safeParse({ full_name: "Ravi", agency_name: "Sun Travels", email: "r@x.in", password: "longenoughpassword" }).success).toBe(false);
    expect(signupSchema.safeParse({ full_name: "Ravi", agency_name: "Sun Travels", email: "r@x.in", password: "longenough123" }).success).toBe(true);
  });
});
