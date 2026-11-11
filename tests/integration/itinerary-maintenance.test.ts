import { beforeAll, describe, expect, it } from "vitest";
import { acceptedBooking, admin, createAgency, createCustomer, createEnquiry, createQuotation, isoDay, setQuotationStatus, sqlBypassingTriggers, stackAvailable, type TestAgency } from "./helpers";

describe.skipIf(!stackAvailable)("itineraries and scheduled maintenance", () => {
  let t: TestAgency;
  beforeAll(async () => { t = await createAgency("itin"); });

  it("derives day dates, keeps activities ordered and links to the booking on conversion", async () => {
    const c = await createCustomer(t.agent);
    const e = await createEnquiry(t.agent, c.id);
    const qid = await createQuotation(t.agent, e.id);
    const { data: it, error } = await t.agent.from("itineraries").insert({ name: "Bali 5N", destination: "Bali", start_date: isoDay(10), end_date: isoDay(12), enquiry_id: e.id, quotation_id: qid }).select("id").single();
    expect(error).toBeNull();
    const days = await t.agent.from("itinerary_days").insert([1, 2, 3].map((n) => ({ itinerary_id: it!.id, day_number: n }))).select("id, day_number, day_date");
    expect(days.error).toBeNull();
    expect(days.data?.find((d) => d.day_number === 3)?.day_date).toBe(isoDay(12));
    const outOfRange = await t.agent.from("itinerary_days").insert({ itinerary_id: it!.id, day_number: 4 });
    expect(outOfRange.error?.message).toMatch(/outside the itinerary/);
    const day1 = days.data!.find((d) => d.day_number === 1)!.id;
    const acts = await t.agent.from("itinerary_activities").insert([
      { day_id: day1, position: 0, title: "Airport pickup" }, { day_id: day1, position: 1, title: "Check-in" }, { day_id: day1, position: 2, title: "Beach dinner" },
    ]).select("id, title");
    const dinner = acts.data!.find((a) => a.title === "Beach dinner")!.id;
    expect((await t.agent.rpc("move_itinerary_activity", { p_activity_id: dinner, p_direction: "up" })).error).toBeNull();
    const { data: ordered } = await t.agent.from("itinerary_activities").select("title").eq("day_id", day1).order("position");
    expect(ordered?.map((a) => a.title)).toEqual(["Airport pickup", "Beach dinner", "Check-in"]);
    // another agent cannot see it
    expect((await t.agent2.from("itineraries").select("id").eq("id", it!.id)).data).toHaveLength(0);
    // converting the quotation links the itinerary to the booking
    for (const s of ["reviewed", "sent", "accepted"]) expect((await setQuotationStatus(t.owner, qid, s)).error).toBeNull();
    const { data: bookingId } = await t.agent.rpc("convert_quotation_to_booking", { p_quotation_id: qid, p_notes: null });
    const { data: linked } = await t.agent.from("itineraries").select("booking_id").eq("id", it!.id).single();
    expect(linked?.booking_id).toBe(bookingId);
  });

  it("expires overdue sent quotations and notifies about upcoming departures", async () => {
    const c = await createCustomer(t.agent);
    const e = await createEnquiry(t.agent, c.id, { departure_date: isoDay(2), return_date: isoDay(4) });
    await acceptedBooking(t, e.id);
    const e2 = await createEnquiry(t.agent, c.id, { destination: "Goa" });
    const q2 = await createQuotation(t.agent, e2.id);
    await setQuotationStatus(t.owner, q2, "reviewed");
    await setQuotationStatus(t.owner, q2, "sent");
    // simulate the passage of time with the service role (test-only)
    await sqlBypassingTriggers("update public.quotations set issue_date = $1, valid_until = $2 where id = $3", [isoDay(-20), isoDay(-1), q2]);
    const { data, error } = await admin().rpc("run_daily_maintenance");
    expect(error).toBeNull();
    expect(data.quotations_expired).toBeGreaterThanOrEqual(1);
    const { data: q } = await t.owner.from("quotations").select("status").eq("id", q2).single();
    expect(q?.status).toBe("expired");
    const { data: notes } = await t.agent.from("notifications").select("type").eq("type", "booking.upcoming");
    expect(notes?.length).toBeGreaterThanOrEqual(1);
    // idempotent: running again does not duplicate notifications
    await admin().rpc("run_daily_maintenance");
    const { data: again } = await t.agent.from("notifications").select("type").eq("type", "booking.upcoming");
    expect(again?.length).toBe(notes?.length);
    // signed-in users cannot run maintenance
    expect((await t.owner.rpc("run_daily_maintenance")).error).not.toBeNull();
  });
});
