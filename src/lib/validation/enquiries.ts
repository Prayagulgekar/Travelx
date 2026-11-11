import { z } from "zod";
import { ENQUIRY_STATUSES } from "@/lib/domain/status";
import { currencyCode, intInRange, isoDate, optionalMoneyString, optionalText, optionalUuid, requiredText, todayIso, uuid } from "./common";

export const TRAVEL_CATEGORIES = ["leisure", "honeymoon", "family", "business", "pilgrimage", "adventure", "group", "educational", "other"] as const;
export const TRANSPORT_OPTIONS = ["flight", "train", "bus", "car", "cruise", "mixed", "none"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const TRAVEL_CATEGORY_LABELS: Record<(typeof TRAVEL_CATEGORIES)[number], string> = {
  leisure: "Leisure", honeymoon: "Honeymoon", family: "Family", business: "Business", pilgrimage: "Pilgrimage",
  adventure: "Adventure", group: "Group tour", educational: "Educational", other: "Other",
};
export const TRANSPORT_LABELS: Record<(typeof TRANSPORT_OPTIONS)[number], string> = {
  flight: "Flight", train: "Train", bus: "Bus", car: "Car / cab", cruise: "Cruise", mixed: "Mixed", none: "Not required",
};

const enquiryBase = z.object({
  customer_id: uuid("Customer"),
  source_location: requiredText("Source location", 2, 120),
  destination: requiredText("Destination", 2, 120)
    .refine((v) => /[A-Za-zÀ-ɏऀ-ॿ]/.test(v), "Destination must contain a place name."),
  departure_date: isoDate("Departure date"),
  return_date: isoDate("Return date"),
  adults: intInRange("Adults", 1, 99),
  children: intInRange("Children", 0, 99),
  infants: intInRange("Infants", 0, 20),
  rooms: intInRange("Rooms", 1, 50),
  budget: optionalMoneyString("Budget"),
  currency: currencyCode.default("INR"),
  travel_category: z.preprocess((v) => (v === "" ? undefined : v), z.enum(TRAVEL_CATEGORIES).optional()),
  preferred_transport: z.preprocess((v) => (v === "" ? undefined : v), z.enum(TRANSPORT_OPTIONS).optional()),
  accommodation_preference: optionalText(300),
  special_requirements: optionalText(2000),
  assigned_to: optionalUuid,
  priority: z.enum(PRIORITIES).default("medium"),
});

function refineEnquiry<T extends z.ZodType<z.output<typeof enquiryBase>>>(schema: T, { allowPastDeparture }: { allowPastDeparture: boolean }) {
  return schema.superRefine((data: z.infer<typeof enquiryBase>, ctx) => {
    if (data.return_date < data.departure_date) {
      ctx.addIssue({ code: "custom", path: ["return_date"], message: "Return date must be on or after the departure date." });
    }
    if (!allowPastDeparture && data.departure_date < todayIso()) {
      ctx.addIssue({ code: "custom", path: ["departure_date"], message: "Departure date cannot be in the past." });
    }
    if (data.infants > data.adults * 2) {
      ctx.addIssue({ code: "custom", path: ["infants"], message: "Each adult can travel with at most two infants." });
    }
    if (data.rooms > data.adults + data.children) {
      ctx.addIssue({ code: "custom", path: ["rooms"], message: "Rooms cannot exceed the number of adults and children." });
    }
    const nights = (Date.parse(data.return_date) - Date.parse(data.departure_date)) / 86_400_000;
    if (nights > 365) {
      ctx.addIssue({ code: "custom", path: ["return_date"], message: "Trips longer than a year are not supported." });
    }
    if (data.source_location.trim().toLowerCase() === data.destination.trim().toLowerCase()) {
      ctx.addIssue({ code: "custom", path: ["destination"], message: "Destination must differ from the source location." });
    }
  });
}

export const enquiryCreateSchema = refineEnquiry(
  enquiryBase.extend({
    idempotency_key: uuid("Submission key"),
    confirm_duplicate: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
  }),
  { allowPastDeparture: false },
);
export const enquiryUpdateSchema = refineEnquiry(enquiryBase, { allowPastDeparture: true });
export type EnquiryCreateInput = z.infer<typeof enquiryCreateSchema>;

export const enquiryStatusSchema = z.object({
  status: z.enum(ENQUIRY_STATUSES),
  reason: optionalText(500),
}).superRefine((d, ctx) => {
  if ((d.status === "lost" || d.status === "cancelled") && !d.reason) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "Please record why the enquiry was lost or cancelled." });
  }
});

export const assignSchema = z.object({ assigned_to: optionalUuid });
