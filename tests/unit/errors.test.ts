import { describe, expect, it } from "vitest";
import { toUserMessage } from "@/lib/errors";

describe("toUserMessage", () => {
  it("maps known unique constraints to friendly messages", () => {
    expect(toUserMessage({ code: "23505", message: 'duplicate key value violates unique constraint "customers_phone_unique"' }))
      .toBe("A customer with this phone number already exists.");
  });
  it("keeps the readable message of business rules raised as unique violations", () => {
    expect(toUserMessage({ code: "23505", message: "This quotation has already been converted into a booking." }))
      .toBe("This quotation has already been converted into a booking.");
  });
  it("never leaks raw duplicate-key text for unknown constraints", () => {
    expect(toUserMessage({ code: "23505", message: 'duplicate key value violates unique constraint "some_internal_idx"' }))
      .toBe("This record already exists.");
  });
});
