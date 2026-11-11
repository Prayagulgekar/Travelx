import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters.`);

/** Empty strings from HTML forms become undefined. */
export const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), trimmed(max).optional());

export const requiredText = (label: string, min: number, max: number) =>
  z.string({ error: `${label} is required.` }).trim()
    .min(1, `${label} is required.`)
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const uuid = (label = "Record") => z.string({ error: `${label} is required.` }).uuid(`${label} is invalid.`);
export const optionalUuid = z.preprocess((v) => (v === "" || v === "none" ? undefined : v), z.string().uuid().optional());

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isoDate = (label: string) =>
  z.string({ error: `${label} is required.` })
    .min(1, `${label} is required.`)
    .regex(ISO_DATE, `${label} must be a valid date.`)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
      `${label} must be a valid date.`);

/** Monetary amount as a string with at most 2 decimals. Kept as string to avoid float rounding. */
export const moneyString = (label: string, { allowZero = true }: { allowZero?: boolean } = {}) =>
  z.preprocess(
    (v) => (typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(/,/g, "") : v),
    z.string({ error: `${label} is required.` })
      .min(1, `${label} is required.`)
      .regex(/^-?\d{1,12}(\.\d{1,2})?$/, `${label} must be a number with at most 2 decimal places.`)
      .refine((v) => !v.startsWith("-"), `${label} cannot be negative.`)
      .refine((v) => allowZero || Number(v) > 0, `${label} must be greater than zero.`),
  );

export const optionalMoneyString = (label: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), moneyString(label).optional());

export const intInRange = (label: string, min: number, max: number) =>
  z.coerce.number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`);

export const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code.");

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns field errors in a flat { field: message } shape for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
