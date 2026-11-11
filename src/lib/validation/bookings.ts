import { z } from "zod";
import { BOOKING_STATUSES } from "@/lib/domain/status";
import { isoDate, optionalText, optionalUuid, requiredText } from "./common";

export const bookingUpdateSchema = z.object({
  departure_date: isoDate("Departure date"),
  return_date: isoDate("Return date"),
  notes: optionalText(4000),
  assigned_to: optionalUuid,
}).refine((d) => d.return_date >= d.departure_date, { path: ["return_date"], message: "Return date must be on or after the departure date." });

export const bookingStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  cancellation_reason: optionalText(1000),
}).superRefine((d, ctx) => {
  if (d.status === "cancelled" && (!d.cancellation_reason || d.cancellation_reason.length < 3)) {
    ctx.addIssue({ code: "custom", path: ["cancellation_reason"], message: "A cancellation reason is required." });
  }
});

export const travellerSchema = z.object({
  full_name: requiredText("Traveller name", 2, 120),
  traveller_type: z.enum(["adult", "child", "infant"]),
  date_of_birth: z.preprocess((v) => (v === "" ? undefined : v), isoDate("Date of birth").optional()),
  nationality: optionalText(80),
  notes: optionalText(500),
});
