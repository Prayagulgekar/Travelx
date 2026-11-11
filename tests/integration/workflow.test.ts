import { beforeAll, describe, expect, it } from "vitest";
import { acceptedBooking, admin, anon, createAgency, createCustomer, createEnquiry, createQuotation, isoDay, ITEMS, setQuotationStatus, stackAvailable, uniquePhone, type TestAgency } from "./helpers";

describe.skipIf(!stackAvailable)("core workflow (database integration)", () => {
  let t: TestAgency;
  beforeAll(async () => { t = await createAgency("wf"); });

  describe("customers", () => {
    it("creates a customer with a generated code, tenant and normalised phone", async () => {
      const c = await createCustomer(t.agent, { phone: "+91 (982) 000-1111".replace("1111", String(Date.now()).slice(-4)), email: "Asha@Example.com" });
      expect(c.customer_code).toMatch(/^CUS-\d{6}$/);
      expect(c.agency_id).toBe(t.agencyId);
      const { data } = await t.agent.from("customers").select("phone_normalized, email, assigned_to").eq("id", c.id).single();
      expect(data?.phone_normalized).toMatch(/^\+91982000\d{4}$/);
      expect(data?.assigned_to).toBe(t.agentId); // agents own the customers they create
    });

    it("rejects a duplicate phone number in the same agency", async () => {
      const phone = uniquePhone();
      await createCustomer(t.owner, { phone });
      const { error } = await t.owner.from("customers").insert({ full_name: "Dup Person", phone: phone.replace(/ /g, "") });
      expect(error?.code).toBe("23505");
    });

    it("rejects invalid email and phone formats at the database level", async () => {
      const bad = await t.owner.from("customers").insert({ full_name: "Bad Email", phone: uniquePhone(), email: "not-an-email" });
      expect(bad.error?.code).toBe("23514");
      const badPhone = await t.owner.from("customers").insert({ full_name: "Bad Phone", phone: "12" });
      expect(badPhone.error).not.toBeNull();
    });

    it("lets a customer exist without an email address", async () => {
      const c = await createCustomer(t.agent, { email: null });
      expect(c.id).toBeTruthy();
    });

    it("prevents agents from archiving and blocks enquiries for archived customers", async () => {
      const c = await createCustomer(t.agent);
      const agentArchive = await t.agent.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", c.id);
      expect(agentArchive.error?.message).toMatch(/Only owners and administrators can archive/);
      const ok = await t.admin.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", c.id).select("id");
      expect(ok.error).toBeNull();
      const enq = await t.admin.from("enquiries").insert({ customer_id: c.id, source_location: "Pune", destination: "Goa", departure_date: isoDay(5), return_date: isoDay(7) });
      expect(enq.error?.message).toMatch(/archived customer/);
      const edit = await t.admin.from("customers").update({ full_name: "Changed" }).eq("id", c.id);
      expect(edit.error?.message).toMatch(/Archived customers cannot be edited/);
    });
  });

  describe("enquiries", () => {
    it("creates an enquiry in status new, assigned to the agent who created it", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      expect(e.enquiry_code).toMatch(/^ENQ-\d{6}$/);
      expect(e.status).toBe("new");
      expect(e.assigned_to).toBe(t.agentId);
    });

    it("rejects return before departure, zero adults, negative budget and past departure", async () => {
      const c = await createCustomer(t.owner);
      const base = { customer_id: c.id, source_location: "Delhi", destination: "Dubai", departure_date: isoDay(10), return_date: isoDay(12), adults: 2 };
      expect((await t.owner.from("enquiries").insert({ ...base, return_date: isoDay(5) })).error?.code).toBe("23514");
      expect((await t.owner.from("enquiries").insert({ ...base, adults: 0 })).error?.code).toBe("23514");
      expect((await t.owner.from("enquiries").insert({ ...base, budget: -10 })).error?.code).toBe("23514");
      expect((await t.owner.from("enquiries").insert({ ...base, departure_date: isoDay(-2) })).error?.message).toMatch(/past/);
    });

    it("rejects duplicate submissions with the same idempotency key", async () => {
      const c = await createCustomer(t.owner);
      const key = crypto.randomUUID();
      const row = { customer_id: c.id, source_location: "Delhi", destination: "Dubai", departure_date: isoDay(10), return_date: isoDay(12), idempotency_key: key };
      expect((await t.owner.from("enquiries").insert(row)).error).toBeNull();
      expect((await t.owner.from("enquiries").insert(row)).error?.code).toBe("23505");
    });

    it("only lets managers reassign, and notifies the new assignee", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const agentTry = await t.agent.from("enquiries").update({ assigned_to: t.agent2Id }).eq("id", e.id);
      expect(agentTry.error?.message).toMatch(/Only owners and administrators can reassign/);
      const ok = await t.admin.from("enquiries").update({ assigned_to: t.agent2Id }).eq("id", e.id).select("assigned_to").single();
      expect(ok.data?.assigned_to).toBe(t.agent2Id);
      const { data: notes } = await t.agent2.from("notifications").select("type, link").eq("link", `/enquiries/${e.id}`);
      expect(notes?.some((n) => n.type === "enquiry.assigned")).toBe(true);
      // agent one no longer sees it (not assigned, but they created it => still visible as creator)
      const vis = await t.agent.from("enquiries").select("id").eq("id", e.id);
      expect(vis.data).toHaveLength(1);
    });

    it("hides other agents' enquiries", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const { data } = await t.agent2.from("enquiries").select("id").eq("id", e.id);
      expect(data).toHaveLength(0);
    });

    it("enforces the status machine and blocks manual conversion", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      expect((await t.agent.from("enquiries").update({ status: "quotation_sent" }).eq("id", e.id)).error?.message).toMatch(/cannot change from new to quotation_sent/);
      expect((await t.agent.from("enquiries").update({ status: "contacted" }).eq("id", e.id)).error).toBeNull();
      expect((await t.agent.from("enquiries").update({ status: "quotation_in_progress" }).eq("id", e.id)).error).toBeNull();
      expect((await t.agent.from("enquiries").update({ status: "converted" }).eq("id", e.id)).error?.message).toMatch(/only when a booking is created/);
    });

    it("stores internal notes authored by the session user", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const { data, error } = await t.agent.from("enquiry_notes").insert({ enquiry_id: e.id, body: "Prefers beach resorts", author_id: t.agentId }).select("author_id").single();
      expect(error).toBeNull();
      expect(data?.author_id).toBe(t.agentId);
      // a forged author is overwritten with the real session user
      const forged = await t.agent.from("enquiry_notes").insert({ enquiry_id: e.id, body: "Forged", author_id: t.ownerId }).select("author_id").single();
      expect(forged.data?.author_id ?? t.agentId).toBe(t.agentId);
    });
  });

  describe("quotations", () => {
    it("computes totals on the server from line items (decimal safe)", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const qid = await createQuotation(t.agent, e.id);
      const { data: q } = await t.agent.from("quotations").select("*").eq("id", qid).single();
      // 5*8000=40000 (+4800 tax) ; 3*18500.50=55501.50 (+2775.08) ; 3*2999.99=8999.97 (+1619.99)
      expect(Number(q.subtotal)).toBeCloseTo(104501.47, 2);
      expect(q.subtotal).toBe(104501.47);
      expect(q.tax_amount).toBe(9195.07);
      expect(q.grand_total).toBe(113696.54);
      const { data: enq } = await t.agent.from("enquiries").select("status").eq("id", e.id).single();
      expect(enq?.status).toBe("quotation_in_progress");
    });

    it("ignores client-supplied totals", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const qid = await createQuotation(t.agent, e.id);
      await t.agent.from("quotations").update({ grand_total: 1, subtotal: 1, tax_amount: 0, discount_amount: 0 }).eq("id", qid);
      const { data: q } = await t.agent.from("quotations").select("grand_total").eq("id", qid).single();
      expect(q?.grand_total).toBe(113696.54);
    });

    it("recalculates when items change and applies percentage discounts to the subtotal", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const qid = await createQuotation(t.owner, e.id, { items: [{ category: "meals", description: "Dinner", quantity: "2", unit_price: "1000", tax_rate: "5" }] });
      const add = await t.owner.from("quotation_items").insert({ quotation_id: qid, category: "guide", description: "Guide", quantity: 1, unit_price: 500, tax_rate: 0 });
      expect(add.error).toBeNull();
      await t.owner.from("quotations").update({ discount_type: "percent", discount_value: 10 }).eq("id", qid);
      const { data: q } = await t.owner.from("quotations").select("subtotal, tax_amount, discount_amount, grand_total").eq("id", qid).single();
      expect(q).toMatchObject({ subtotal: 2500, tax_amount: 100, discount_amount: 250, grand_total: 2350 });
    });

    it("rejects discounts above the subtotal and agent discounts above the agency limit", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const over = await t.owner.rpc("save_quotation", { p_quotation_id: null, p_header: { enquiry_id: e.id, title: "T1", issue_date: isoDay(0), valid_until: isoDay(5), discount_type: "fixed", discount_value: "999999" }, p_items: ITEMS });
      expect(over.error?.message).toMatch(/Discount cannot exceed/);
      const agentBig = await t.agent.rpc("save_quotation", { p_quotation_id: null, p_header: { enquiry_id: e.id, title: "T2", issue_date: isoDay(0), valid_until: isoDay(5), discount_type: "percent", discount_value: "25" }, p_items: ITEMS });
      expect(agentBig.error?.message).toMatch(/Travel agents can apply discounts up to/);
      // the whole save is rolled back: no half-created quotation remains
      const { data: qs } = await t.owner.from("quotations").select("title").eq("enquiry_id", e.id);
      expect(qs?.map((x) => x.title)).not.toContain("T2");
      const agentSmall = await t.agent.rpc("save_quotation", { p_quotation_id: null, p_header: { enquiry_id: e.id, title: "T3", issue_date: isoDay(0), valid_until: isoDay(5), discount_type: "percent", discount_value: "10" }, p_items: ITEMS });
      expect(agentSmall.error).toBeNull();
    });

    it("enforces quotation transitions and review permissions", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const qid = await createQuotation(t.agent, e.id);
      expect((await setQuotationStatus(t.owner, qid, "accepted")).error?.message).toMatch(/cannot change from draft to accepted/);
      expect((await setQuotationStatus(t.agent, qid, "reviewed")).error?.message).toMatch(/Only owners and administrators/);
      expect((await setQuotationStatus(t.admin, qid, "reviewed")).error).toBeNull();
      // reviewed quotations are locked
      const edit = await t.agent.from("quotation_items").insert({ quotation_id: qid, category: "other", description: "Extra", quantity: 1, unit_price: 10 });
      expect(edit.error?.message).toMatch(/only be changed while the quotation is a draft/);
      const title = await t.agent.from("quotations").update({ title: "Changed" }).eq("id", qid);
      expect(title.error?.message).toMatch(/Only draft quotations can be edited/);
      expect((await setQuotationStatus(t.agent, qid, "sent")).error).toBeNull();
      const { data: enq } = await t.agent.from("enquiries").select("status").eq("id", e.id).single();
      expect(enq?.status).toBe("quotation_sent");
    });

    it("duplicates a quotation into a new editable draft", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const qid = await createQuotation(t.agent, e.id);
      const { data: newId, error } = await t.agent.rpc("duplicate_quotation", { p_quotation_id: qid });
      expect(error).toBeNull();
      const { data: q } = await t.agent.from("quotations").select("status, grand_total, duplicated_from").eq("id", newId).single();
      expect(q).toMatchObject({ status: "draft", grand_total: 113696.54, duplicated_from: qid });
    });
  });

  describe("bookings", () => {
    it("converts an accepted quotation using the frozen snapshot, once", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const { quotationId, bookingId } = await acceptedBooking(t, e.id);
      const { data: b } = await t.agent.from("bookings").select("*").eq("id", bookingId).single();
      expect(b.booking_code).toMatch(/^BKG-\d{6}$/);
      expect(b.total_amount).toBe(113696.54);
      expect(b.status).toBe("pending_confirmation");
      expect(b.customer_id).toBe(c.id);
      expect(b.quotation_snapshot.items).toHaveLength(3);
      const { data: enq } = await t.agent.from("enquiries").select("status").eq("id", e.id).single();
      expect(enq?.status).toBe("converted");
      const again = await t.agent.rpc("convert_quotation_to_booking", { p_quotation_id: quotationId, p_notes: null });
      expect(again.error?.message).toMatch(/already been converted/);
      // accepted quotations are locked, so the booking price cannot drift
      expect((await t.owner.from("quotations").update({ discount_type: "fixed", discount_value: 100 }).eq("id", quotationId)).error).not.toBeNull();
      expect((await t.owner.from("bookings").update({ total_amount: 1 }).eq("id", bookingId).select("total_amount").single()).data?.total_amount).toBe(113696.54);
    });

    it("refuses to convert quotations that are not accepted", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const qid = await createQuotation(t.agent, e.id);
      const res = await t.agent.rpc("convert_quotation_to_booking", { p_quotation_id: qid, p_notes: null });
      expect(res.error?.message).toMatch(/Only accepted quotations/);
    });

    it("enforces booking transitions, cancellation reasons and cancel permissions", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id, { departure_date: isoDay(0), return_date: isoDay(3) });
      const { bookingId } = await acceptedBooking(t, e.id);
      expect((await t.agent.from("bookings").update({ status: "completed" }).eq("id", bookingId)).error?.message).toMatch(/cannot change from pending confirmation to completed/);
      expect((await t.agent.from("bookings").update({ status: "confirmed" }).eq("id", bookingId)).error).toBeNull();
      expect((await t.agent.from("bookings").update({ status: "in_progress" }).eq("id", bookingId)).error).toBeNull();
      expect((await t.agent.from("bookings").update({ status: "cancelled", cancellation_reason: "Customer ill" }).eq("id", bookingId)).error?.message).toMatch(/Only owners and administrators can cancel/);
      expect((await t.admin.from("bookings").update({ status: "cancelled" }).eq("id", bookingId)).error).not.toBeNull();
      expect((await t.admin.from("bookings").update({ status: "cancelled", cancellation_reason: "Customer ill" }).eq("id", bookingId)).error).toBeNull();
      expect((await t.admin.from("bookings").update({ status: "confirmed" }).eq("id", bookingId)).error).not.toBeNull();
      const { data: log } = await t.owner.from("activity_logs").select("action, old_status, new_status").eq("entity_id", bookingId).eq("action", "booking.status_changed");
      expect(log?.map((l) => l.new_status)).toEqual(expect.arrayContaining(["confirmed", "in_progress", "cancelled"]));
    });
  });

  describe("payments and refunds", () => {
    it("records payments (managers only), blocks overpayment and duplicate references", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const { bookingId } = await acceptedBooking(t, e.id);
      const agentPay = await t.agent.from("payments").insert({ booking_id: bookingId, amount: 100, method: "cash", customer_id: c.id, currency: "INR" });
      expect(agentPay.error).not.toBeNull();
      const ok = await t.admin.from("payments").insert({ booking_id: bookingId, amount: "50000.00", method: "upi", transaction_reference: `UTR-${bookingId.slice(0, 8)}`, customer_id: c.id, currency: "XXX" }).select("*").single();
      expect(ok.error).toBeNull();
      expect(ok.data.currency).toBe("INR"); // forced from booking
      expect(ok.data.payment_code).toMatch(/^PAY-\d{6}$/);
      const dup = await t.admin.from("payments").insert({ booking_id: bookingId, amount: 10, method: "upi", transaction_reference: `utr-${bookingId.slice(0, 8)}`, customer_id: c.id, currency: "INR" });
      expect(dup.error?.code).toBe("23505");
      const over = await t.admin.from("payments").insert({ booking_id: bookingId, amount: "70000.00", method: "cash", customer_id: c.id, currency: "INR" });
      expect(over.error?.message).toMatch(/exceeds the outstanding balance/);
      const neg = await t.admin.from("payments").insert({ booking_id: bookingId, amount: -5, method: "cash", customer_id: c.id, currency: "INR" });
      expect(neg.error?.code).toBe("23514");
      const pending = await t.admin.from("payments").insert({ booking_id: bookingId, amount: "70000.00", method: "cheque", transaction_reference: `CHQ-${bookingId.slice(0, 6)}`, status: "pending", customer_id: c.id, currency: "INR" }).select("id").single();
      expect(pending.error).toBeNull(); // pending payments are not capped (they are not counted)
      const { data: bal } = await t.admin.from("booking_balances").select("amount_received, amount_pending, outstanding").eq("booking_id", bookingId).single();
      expect(bal).toMatchObject({ amount_received: 50000, amount_pending: 70000, outstanding: 63696.54 });
      const recv = await t.admin.from("payments").update({ status: "received" }).eq("id", pending.data!.id);
      expect(recv.error?.message).toMatch(/exceeds the outstanding balance/);
      expect((await t.admin.from("payments").update({ status: "failed" }).eq("id", pending.data!.id)).error).toBeNull();
      expect((await t.admin.from("payments").update({ status: "received" }).eq("id", pending.data!.id)).error).not.toBeNull();
      // no delete policy exists and a trigger blocks deletes even for the service role
      await t.owner.from("payments").delete().eq("id", ok.data.id);
      expect((await t.owner.from("payments").select("id").eq("id", ok.data.id)).data).toHaveLength(1);
      const svcDel = await admin().from("payments").delete().eq("id", ok.data.id);
      expect(svcDel.error?.message).toMatch(/cannot be deleted/);
      const edit = await t.owner.from("payments").update({ amount: 1 }).eq("id", ok.data.id);
      expect(edit.error?.message).toMatch(/Only pending payments can be edited/);
    });

    it("lets only the owner refund, never more than the refundable amount", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const { bookingId } = await acceptedBooking(t, e.id);
      const { data: p } = await t.owner.from("payments").insert({ booking_id: bookingId, amount: "10000.00", method: "cash", customer_id: c.id, currency: "INR" }).select("id").single();
      const byAdmin = await t.admin.from("payment_refunds").insert({ payment_id: p!.id, amount: 100, reason: "Overcharge" });
      expect(byAdmin.error).not.toBeNull();
      const tooMuch = await t.owner.from("payment_refunds").insert({ payment_id: p!.id, amount: "10000.01", reason: "Too much" });
      expect(tooMuch.error?.message).toMatch(/Refund exceeds the refundable amount/);
      expect((await t.owner.from("payment_refunds").insert({ payment_id: p!.id, amount: "4000.00", reason: "Hotel downgrade" })).error).toBeNull();
      let { data: pay } = await t.owner.from("payments").select("status, refunded_amount").eq("id", p!.id).single();
      expect(pay).toMatchObject({ status: "partially_refunded", refunded_amount: 4000 });
      expect((await t.owner.from("payment_refunds").insert({ payment_id: p!.id, amount: "6000.01", reason: "Too much" })).error).not.toBeNull();
      expect((await t.owner.from("payment_refunds").insert({ payment_id: p!.id, amount: "6000.00", reason: "Trip cancelled" })).error).toBeNull();
      ({ data: pay } = await t.owner.from("payments").select("status, refunded_amount").eq("id", p!.id).single());
      expect(pay).toMatchObject({ status: "refunded", refunded_amount: 10000 });
      expect((await t.owner.from("payment_refunds").insert({ payment_id: p!.id, amount: "1.00", reason: "Again" })).error?.message).toMatch(/Only received payments can be refunded/);
    });

    it("counts only received payments as revenue and hides finance from agents", async () => {
      const today = isoDay(0);
      const { data: m } = await t.owner.rpc("dashboard_metrics", { p_from: today, p_to: today });
      expect(typeof m.revenue).toBe("number");
      const { data: payments } = await t.owner.from("payments").select("amount, status, payment_date");
      const { data: refunds } = await t.owner.from("payment_refunds").select("amount, refund_date");
      const expected = (payments ?? []).filter((p) => ["received", "partially_refunded", "refunded"].includes(p.status) && p.payment_date === today).reduce((a, p) => a + Number(p.amount), 0)
        - (refunds ?? []).filter((r) => r.refund_date === today).reduce((a, r) => a + Number(r.amount), 0);
      expect(m.revenue).toBeCloseTo(expected, 2);
      const { data: am } = await t.agent.rpc("dashboard_metrics", { p_from: today, p_to: today });
      expect(am.revenue).toBeNull();
      expect(am.outstanding).toBeNull();
      const { data: agentPayments } = await t.agent.from("payments").select("id");
      expect(agentPayments).toHaveLength(0);
    });
  });

  describe("audit and notifications", () => {
    it("writes activity logs that users cannot forge or edit", async () => {
      const c = await createCustomer(t.agent);
      const { data: logs } = await t.owner.from("activity_logs").select("action, actor_id").eq("entity_id", c.id);
      expect(logs?.[0]).toMatchObject({ action: "customer.created", actor_id: t.agentId });
      const forge = await t.owner.from("activity_logs").insert({ agency_id: t.agencyId, entity_type: "customer", entity_id: c.id, action: "x", summary: "forged" });
      expect(forge.error).not.toBeNull();
      const del = await t.owner.from("activity_logs").delete().eq("entity_id", c.id).select("id");
      expect(del.error ?? del.data?.length === 0).toBeTruthy();
    });

    it("notifies managers about new enquiries; users can only mark their own as read", async () => {
      const c = await createCustomer(t.agent);
      const e = await createEnquiry(t.agent, c.id);
      const { data: n } = await t.owner.from("notifications").select("id, type").eq("link", `/enquiries/${e.id}`);
      expect(n?.some((x) => x.type === "enquiry.created")).toBe(true);
      const other = await t.agent.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n![0]!.id).select("id");
      expect(other.data).toHaveLength(0);
      const own = await t.owner.from("notifications").update({ title: "hacked" }).eq("id", n![0]!.id);
      expect(own.error).not.toBeNull();
    });
  });

  describe("relational integrity", () => {
    it("prevents deleting customers that have enquiries and members deleting themselves", async () => {
      const c = await createCustomer(t.owner);
      await createEnquiry(t.owner, c.id);
      const del = await admin().from("customers").delete().eq("id", c.id);
      expect(del.error?.code).toBe("23503");
      await t.owner.from("agency_members").delete().eq("user_id", t.ownerId);
      const { data: still } = await admin().from("agency_members").select("id").eq("user_id", t.ownerId);
      expect(still).toHaveLength(1);
    });

    it("keeps at least one active owner and stops admins managing admins", async () => {
      const r = await t.admin.from("agency_members").update({ role: "agent" }).eq("user_id", t.ownerId);
      expect(r.error?.message).toMatch(/Administrators can only manage travel agents/);
      const self = await t.owner.from("agency_members").update({ role: "agent" }).eq("user_id", t.ownerId);
      expect(self.error?.message).toMatch(/cannot change your own role/);
    });

    it("gives anonymous clients no access", async () => {
      const a = anon();
      expect((await a.from("customers").select("id")).error).not.toBeNull();
      expect((await a.rpc("dashboard_metrics", { p_from: isoDay(-30), p_to: isoDay(0) })).error).not.toBeNull();
    });
  });
});
