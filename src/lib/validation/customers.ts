import { z } from "zod";
import { optionalText, optionalUuid, requiredText } from "./common";

export const CUSTOMER_SOURCES = ["walk_in", "phone", "website", "referral", "social_media", "email", "partner", "repeat", "other"] as const;
export const CUSTOMER_SOURCE_LABELS: Record<(typeof CUSTOMER_SOURCES)[number], string> = {
  walk_in: "Walk-in", phone: "Phone call", website: "Website", referral: "Referral", social_media: "Social media",
  email: "Email", partner: "Partner agency", repeat: "Repeat customer", other: "Other",
};

/** Normalises a phone number to an optional leading + followed by digits only. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

export const phoneSchema = z.string({ error: "Phone number is required." }).trim()
  .min(1, "Phone number is required.")
  .max(32, "Phone number is too long.")
  .regex(/^\+?[0-9\s().-]+$/, "Phone number can contain digits, spaces, brackets, dashes and a leading +.")
  .refine((v) => /^\+?[0-9]{7,15}$/.test(normalizePhone(v)), "Phone number must have 7 to 15 digits.");

export const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().email("Enter a valid email address.").max(254).optional(),
);

export const customerSchema = z.object({
  full_name: requiredText("Full name", 2, 120),
  phone: phoneSchema,
  email: optionalEmail,
  address: optionalText(300),
  city: optionalText(80),
  country: optionalText(80),
  source: z.preprocess((v) => (v === "" ? undefined : v), z.enum(CUSTOMER_SOURCES).optional()),
  notes: optionalText(4000),
  assigned_to: optionalUuid,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const noteSchema = z.object({ body: requiredText("Note", 1, 4000) });
