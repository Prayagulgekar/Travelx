// Centralised error handling. Database and auth errors are mapped to safe, user-facing messages;
// internals (SQL, stack traces, constraint names) are logged server-side but never returned.

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class AppError extends Error {
  constructor(message: string, public readonly status = 400, public readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}
export class AuthError extends AppError {
  constructor(message = "Your session has expired. Please sign in again.") { super(message, 401); }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") { super(message, 403); }
}
export class NotFoundError extends AppError {
  constructor(message = "The record was not found or you do not have access to it.") { super(message, 404); }
}

interface PgLikeError { code?: string; message?: string; details?: string | null; hint?: string | null }

const UNIQUE_MESSAGES: Array<[RegExp, string]> = [
  [/customers_phone_unique/, "A customer with this phone number already exists."],
  [/customers_email_unique/, "A customer with this email address already exists."],
  [/payments_reference_unique/, "A payment with this transaction reference has already been recorded."],
  [/payments_idempotency_unique|enquiries_idempotency_unique/, "This form was already submitted."],
  [/bookings_one_per_quotation/, "This quotation has already been converted into a booking."],
  [/quotations_one_accepted_per_enquiry/, "Another quotation for this enquiry has already been accepted."],
  [/itinerary_days_unique/, "That day already exists in the itinerary."],
  [/agency_members_one_agency_per_user/, "This person already belongs to an agency workspace."],
];

/** Converts a Supabase/PostgREST error into a message that is safe to show users. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  const e = (error ?? {}) as PgLikeError;
  const text = `${e.message ?? ""} ${e.details ?? ""}`;
  switch (e.code) {
    case "23505": {
      const hit = UNIQUE_MESSAGES.find(([re]) => re.test(text));
      if (hit) return hit[1];
      // Business-rule functions raise 23505 with their own readable message (no constraint name),
      // e.g. "This quotation has already been converted into a booking."
      return e.message && !/duplicate key/.test(e.message) ? e.message : "This record already exists.";
    }
    case "23503":
      return e.message && !/violates foreign key/.test(e.message) ? e.message : "A related record is missing or still in use.";
    case "23514":
      return e.message && !/violates check constraint/.test(e.message) ? e.message : "Some values are outside the allowed range.";
    case "42501":
      return e.message && !/permission denied|row-level security/.test(e.message)
        ? e.message : "You do not have permission to perform this action.";
    case "P0001":
      return e.message ?? "The request could not be completed.";
    case "PGRST116":
      return "The record was not found or you do not have access to it.";
    case "22P02":
    case "22007":
    case "22008":
      return "One of the values is not in a valid format.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function logServerError(context: string, error: unknown): void {
  // Structured, credential-free log line. Request bodies are deliberately not logged.
  const e = error as PgLikeError & { stack?: string };
  console.error(JSON.stringify({ level: "error", context, code: e?.code, message: e?.message }));
}

export function failure(error: unknown, context: string): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (!(error instanceof AppError) || error.status >= 500) logServerError(context, error);
  return { ok: false, error: toUserMessage(error), fieldErrors: error instanceof AppError ? error.fieldErrors : undefined };
}
