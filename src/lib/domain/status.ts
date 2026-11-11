// Allowed status transitions. These maps are the single TypeScript source of truth and mirror
// the *_transition_allowed functions in supabase/migrations/20261101000200_logic.sql.

export const ENQUIRY_STATUSES = [
  "new", "contacted", "requirements_pending", "quotation_in_progress", "quotation_sent", "converted", "lost", "cancelled",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const QUOTATION_STATUSES = ["draft", "reviewed", "sent", "accepted", "rejected", "expired"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const BOOKING_STATUSES = ["pending_confirmation", "confirmed", "in_progress", "completed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "received", "failed", "refunded", "partially_refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ENQUIRY_TRANSITIONS: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  new: ["contacted", "requirements_pending", "quotation_in_progress", "lost", "cancelled"],
  contacted: ["requirements_pending", "quotation_in_progress", "lost", "cancelled"],
  requirements_pending: ["contacted", "quotation_in_progress", "lost", "cancelled"],
  quotation_in_progress: ["requirements_pending", "quotation_sent", "converted", "lost", "cancelled"],
  quotation_sent: ["quotation_in_progress", "converted", "lost", "cancelled"],
  converted: [],
  lost: ["contacted"],
  cancelled: [],
};

/** "converted" is set by the system when a booking is created, never manually. */
export function manualEnquiryTransitions(from: EnquiryStatus): EnquiryStatus[] {
  return ENQUIRY_TRANSITIONS[from].filter((s) => s !== "converted");
}

export const QUOTATION_TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  draft: ["reviewed"],
  reviewed: ["draft", "sent"],
  sent: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
};

export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Payment refund statuses are only reached by recording a refund. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["received", "failed"],
  received: [],
  failed: [],
  partially_refunded: [],
  refunded: [],
};

function allowed<S extends string>(map: Record<S, readonly S[]>, from: S, to: S): boolean {
  return from === to || map[from].includes(to);
}

export const canTransitionEnquiry = (from: EnquiryStatus, to: EnquiryStatus) => allowed(ENQUIRY_TRANSITIONS, from, to);
export const canTransitionQuotation = (from: QuotationStatus, to: QuotationStatus) => allowed(QUOTATION_TRANSITIONS, from, to);
export const canTransitionBooking = (from: BookingStatus, to: BookingStatus) => allowed(BOOKING_TRANSITIONS, from, to);
export const canTransitionPayment = (from: PaymentStatus, to: PaymentStatus) => allowed(PAYMENT_TRANSITIONS, from, to);

export const isEnquiryClosed = (s: EnquiryStatus) => s === "converted" || s === "cancelled";
export const isQuotationEditable = (s: QuotationStatus) => s === "draft";
export const isBookingClosed = (s: BookingStatus) => s === "completed" || s === "cancelled";

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  requirements_pending: "Requirements pending",
  quotation_in_progress: "Quotation in progress",
  quotation_sent: "Quotation sent",
  converted: "Converted",
  lost: "Lost",
  cancelled: "Cancelled",
  draft: "Draft",
  reviewed: "Reviewed",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  pending: "Pending",
  received: "Received",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

export const statusLabel = (s: string) => STATUS_LABELS[s] ?? s.replace(/_/g, " ");
