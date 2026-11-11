import { beforeAll, describe, expect, it } from "vitest";
import { acceptedBooking, createAgency, createCustomer, createEnquiry, createQuotation, isoDay, stackAvailable, type TestAgency } from "./helpers";

describe.skipIf(!stackAvailable)("agency isolation (RLS)", () => {
  let a: TestAgency;
  let b: TestAgency;
  let ids: { customer: string; enquiry: string; quotation: string; booking: string; payment: string };

  beforeAll(async () => {
    [a, b] = await Promise.all([createAgency("iso-a"), createAgency("iso-b")]);
    const c = await createCustomer(a.owner);
    const e = await createEnquiry(a.owner, c.id);
    const { quotationId, bookingId } = await acceptedBooking(a, e.id, a.owner);
    const { data: p } = await a.owner.from("payments").insert({ booking_id: bookingId, amount: 1000, method: "cash", customer_id: c.id, currency: "INR" }).select("id").single();
    ids = { customer: c.id, enquiry: e.id, quotation: quotationId, booking: bookingId, payment: p!.id };
  });

  it("cannot read another agency's records by id", async () => {
    for (const [table, id] of [["customers", ids.customer], ["enquiries", ids.enquiry], ["quotations", ids.quotation], ["bookings", ids.booking], ["payments", ids.payment]] as const) {
      const { data, error } = await b.owner.from(table).select("id").eq("id", id);
      expect(error).toBeNull();
      expect(data, table).toHaveLength(0);
    }
    const { data: items } = await b.owner.from("quotation_items").select("id").eq("quotation_id", ids.quotation);
    expect(items).toHaveLength(0);
    const { data: logs } = await b.owner.from("activity_logs").select("id").eq("entity_id", ids.booking);
    expect(logs).toHaveLength(0);
    const { data: bal } = await b.owner.from("booking_balances").select("booking_id").eq("booking_id", ids.booking);
    expect(bal).toHaveLength(0);
  });

  it("cannot modify another agency's records", async () => {
    const upd = await b.owner.from("customers").update({ full_name: "Hijacked" }).eq("id", ids.customer).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const st = await b.owner.from("bookings").update({ status: "cancelled", cancellation_reason: "nope" }).eq("id", ids.booking).select("id");
    expect(st.data ?? []).toHaveLength(0);
    const { data: still } = await a.owner.from("customers").select("full_name").eq("id", ids.customer).single();
    expect(still?.full_name).not.toBe("Hijacked");
  });

  it("cannot attach records to another agency's parents", async () => {
    const enq = await b.owner.from("enquiries").insert({ customer_id: ids.customer, source_location: "X City", destination: "Y City", departure_date: isoDay(3), return_date: isoDay(4) });
    expect(enq.error).not.toBeNull();
    const item = await b.owner.from("quotation_items").insert({ quotation_id: ids.quotation, category: "other", description: "x", quantity: 1, unit_price: 1 });
    expect(item.error).not.toBeNull();
    const pay = await b.owner.from("payments").insert({ booking_id: ids.booking, amount: 1, method: "cash", customer_id: ids.customer, currency: "INR" });
    expect(pay.error).not.toBeNull();
    const refund = await b.owner.from("payment_refunds").insert({ payment_id: ids.payment, amount: 1, reason: "steal" });
    expect(refund.error).not.toBeNull();
    const conv = await b.owner.rpc("convert_quotation_to_booking", { p_quotation_id: ids.quotation, p_notes: null });
    expect(conv.error).not.toBeNull();
    const dup = await b.owner.rpc("duplicate_quotation", { p_quotation_id: ids.quotation });
    expect(dup.error).not.toBeNull();
  });

  it("cannot forge agency_id on insert", async () => {
    const { data, error } = await b.owner.from("customers").insert({ agency_id: a.agencyId, full_name: "Forged Tenant", phone: "+44 7700 900123" }).select("agency_id").single();
    expect(error).toBeNull();
    expect(data?.agency_id).toBe(b.agencyId); // trigger overrides with the caller's agency
  });

  it("does not leak other agencies' members or settings", async () => {
    const { data: members } = await b.owner.from("agency_members").select("agency_id");
    expect(new Set(members?.map((m) => m.agency_id))).toEqual(new Set([b.agencyId]));
    const { data: agencies } = await b.owner.from("agencies").select("id");
    expect(agencies?.map((x) => x.id)).toEqual([b.agencyId]);
    const upd = await b.admin.from("agencies").update({ name: "Renamed by admin" }).eq("id", b.agencyId).select("id");
    expect(upd.data ?? []).toHaveLength(0); // only owners can change agency settings
  });

  it("counts only the caller's agency in reports", async () => {
    const q = await createQuotation(b.owner, (await createEnquiry(b.owner, (await createCustomer(b.owner)).id)).id);
    expect(q).toBeTruthy();
    const { data } = await b.owner.rpc("report_summary", { p_from: isoDay(-1), p_to: isoDay(1) });
    expect(data.quotations_created).toBe(1);
  });
});
