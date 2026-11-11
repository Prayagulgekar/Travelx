import { z } from "zod";
import { ROLES } from "@/lib/domain/permissions";
import { currencyCode, intInRange, isoDate, optionalText, optionalUuid, requiredText } from "./common";
import { optionalEmail } from "./customers";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(72, "Use at most 72 characters.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letters and at least one number.");

export const signupSchema = z.object({
  full_name: requiredText("Your name", 2, 120),
  agency_name: requiredText("Agency name", 2, 120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: passwordSchema,
  currency: currencyCode.default("INR"),
});

export const resetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.") });
export const newPasswordSchema = z.object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });
export const changePasswordSchema = z.object({ current_password: z.string().min(1, "Enter your current password.").max(72), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." })
  .refine((d) => d.password !== d.current_password, { path: ["password"], message: "Choose a password different from your current one." });

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  full_name: requiredText("Name", 2, 120),
  role: z.enum(ROLES),
});
export const memberUpdateSchema = z.object({
  role: z.enum(ROLES),
  status: z.enum(["active", "suspended"]),
});

export const profileSchema = z.object({
  full_name: requiredText("Name", 2, 120),
  phone: optionalText(32),
  job_title: optionalText(80),
});

export const agencySchema = z.object({
  name: requiredText("Agency name", 2, 120),
  legal_name: optionalText(160),
  email: optionalEmail,
  phone: optionalText(32),
  website: optionalText(200),
  address: optionalText(300),
  city: optionalText(80),
  country: optionalText(80),
  tax_id: optionalText(40),
  currency: currencyCode,
  default_tax_rate: z.coerce.number().min(0).max(100),
  max_agent_discount_percent: z.coerce.number().min(0).max(100),
  quotation_validity_days: intInRange("Validity days", 1, 365),
  quotation_terms: optionalText(5000),
  payment_terms: optionalText(3000),
});

export const itinerarySchema = z.object({
  name: requiredText("Itinerary name", 2, 160),
  destination: requiredText("Destination", 2, 120),
  start_date: isoDate("Start date"),
  end_date: isoDate("End date"),
  enquiry_id: optionalUuid,
  quotation_id: optionalUuid,
  booking_id: optionalUuid,
  notes: optionalText(4000),
}).superRefine((d, ctx) => {
  if (d.end_date < d.start_date) ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date must be on or after the start date." });
  const days = (Date.parse(d.end_date) - Date.parse(d.start_date)) / 86_400_000;
  if (days > 120) ctx.addIssue({ code: "custom", path: ["end_date"], message: "Itineraries can cover at most 121 days." });
});

export const itineraryDaySchema = z.object({
  title: optionalText(160),
  notes: optionalText(2000),
});

export const activitySchema = z.object({
  title: requiredText("Activity title", 1, 160),
  description: optionalText(2000),
  location: optionalText(160),
  start_time: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM.").optional()),
  duration_minutes: z.preprocess((v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(5, "Duration must be at least 5 minutes.").max(1440, "Duration must be under 24 hours.").optional()),
  notes: optionalText(1000),
});

export const dateRangeSchema = z.object({ from: isoDate("From"), to: isoDate("To") })
  .refine((d) => d.to >= d.from, { path: ["to"], message: "End date must be after the start date." });
