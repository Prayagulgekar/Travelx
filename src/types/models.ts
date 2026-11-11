// Row shapes for the tables in supabase/migrations. Numeric columns arrive from PostgREST as
// numbers or strings depending on size; treat them as `Numeric` and convert with money().
import type { Role } from "@/lib/domain/permissions";
import type { BookingStatus, EnquiryStatus, PaymentStatus, QuotationStatus } from "@/lib/domain/status";
import type { DiscountType, QuotationItemCategory } from "@/lib/domain/pricing";
import type { PaymentMethod } from "@/lib/domain/payments";

export type Numeric = string | number;
export type UUID = string;

export interface Agency {
  id: UUID; name: string; legal_name: string | null; email: string | null; phone: string | null; website: string | null;
  address: string | null; city: string | null; country: string | null; tax_id: string | null; currency: string;
  default_tax_rate: Numeric; max_agent_discount_percent: Numeric; quotation_validity_days: number;
  quotation_terms: string | null; payment_terms: string | null; created_at: string; updated_at: string;
}

export interface Profile {
  id: UUID; full_name: string; email: string; phone: string | null; job_title: string | null; created_at: string; updated_at: string;
}

export interface Member {
  id: UUID; agency_id: UUID; user_id: UUID; role: Role; status: "invited" | "active" | "suspended"; created_at: string;
  profile?: Pick<Profile, "full_name" | "email" | "phone" | "job_title"> | null;
}

export interface Customer {
  id: UUID; agency_id: UUID; customer_code: string; full_name: string; phone: string; email: string | null;
  address: string | null; city: string | null; country: string | null; source: string | null; notes: string | null;
  assigned_to: UUID | null; archived_at: string | null; created_by: UUID | null; created_at: string; updated_at: string;
}

export interface Note { id: UUID; body: string; author_id: UUID | null; created_at: string; author?: { full_name: string; email: string } | null }

export interface Enquiry {
  id: UUID; agency_id: UUID; enquiry_code: string; customer_id: UUID; source_location: string; destination: string;
  departure_date: string; return_date: string; adults: number; children: number; infants: number; rooms: number;
  duration_nights: number; budget: Numeric | null; currency: string; travel_category: string | null;
  preferred_transport: string | null; accommodation_preference: string | null; special_requirements: string | null;
  assigned_to: UUID | null; priority: "low" | "medium" | "high" | "urgent"; status: EnquiryStatus; status_reason: string | null;
  created_by: UUID | null; created_at: string; updated_at: string;
  customer?: Pick<Customer, "id" | "full_name" | "phone" | "email" | "customer_code"> | null;
}

export interface QuotationItem {
  id: UUID; quotation_id: UUID; position: number; category: QuotationItemCategory; description: string;
  quantity: Numeric; unit_price: Numeric; tax_rate: Numeric; line_subtotal: Numeric; line_tax: Numeric; line_total: Numeric;
}

export interface Quotation {
  id: UUID; agency_id: UUID; quotation_code: string; enquiry_id: UUID; customer_id: UUID; title: string; status: QuotationStatus;
  issue_date: string; valid_until: string; currency: string; discount_type: DiscountType; discount_value: Numeric;
  subtotal: Numeric; tax_amount: Numeric; discount_amount: Numeric; grand_total: Numeric; terms: string | null;
  payment_terms: string | null; internal_notes: string | null; duplicated_from: UUID | null; reviewed_at: string | null;
  sent_at: string | null; accepted_at: string | null; rejected_at: string | null; expired_at: string | null;
  rejection_reason: string | null; accepted_snapshot: unknown; created_by: UUID | null; created_at: string; updated_at: string;
  customer?: Pick<Customer, "id" | "full_name" | "phone" | "email" | "customer_code" | "address" | "city" | "country"> | null;
  enquiry?: Pick<Enquiry, "id" | "enquiry_code" | "destination" | "source_location" | "departure_date" | "return_date" | "adults" | "children" | "infants" | "rooms" | "budget" | "currency" | "status"> | null;
}

export interface Booking {
  id: UUID; agency_id: UUID; booking_code: string; customer_id: UUID; enquiry_id: UUID; quotation_id: UUID; destination: string;
  departure_date: string; return_date: string; status: BookingStatus; assigned_to: UUID | null; total_amount: Numeric;
  currency: string; quotation_snapshot: unknown; notes: string | null; confirmed_at: string | null; completed_at: string | null;
  cancelled_at: string | null; cancellation_reason: string | null; created_at: string; updated_at: string;
  customer?: Pick<Customer, "id" | "full_name" | "phone" | "email" | "customer_code"> | null;
}

export interface Traveller {
  id: UUID; booking_id: UUID; full_name: string; traveller_type: "adult" | "child" | "infant"; date_of_birth: string | null;
  nationality: string | null; notes: string | null;
}

export interface Payment {
  id: UUID; agency_id: UUID; payment_code: string; booking_id: UUID; customer_id: UUID; amount: Numeric; currency: string;
  method: PaymentMethod; transaction_reference: string | null; payment_date: string; status: PaymentStatus;
  refunded_amount: Numeric; notes: string | null; recorded_by: UUID | null; created_at: string;
  booking?: Pick<Booking, "id" | "booking_code" | "destination" | "total_amount" | "status"> | null;
  customer?: Pick<Customer, "id" | "full_name" | "phone" | "email" | "customer_code"> | null;
}

export interface Refund { id: UUID; payment_id: UUID; amount: Numeric; refund_date: string; reason: string; reference: string | null; recorded_by: UUID | null; created_at: string }

export interface Itinerary {
  id: UUID; agency_id: UUID; name: string; enquiry_id: UUID | null; quotation_id: UUID | null; booking_id: UUID | null;
  destination: string; start_date: string; end_date: string; notes: string | null; created_at: string; updated_at: string;
}
export interface ItineraryActivity {
  id: UUID; day_id: UUID; position: number; title: string; description: string | null; location: string | null;
  start_time: string | null; duration_minutes: number | null; notes: string | null;
}
export interface ItineraryDay { id: UUID; itinerary_id: UUID; day_number: number; day_date: string | null; title: string | null; notes: string | null; activities: ItineraryActivity[] }

export interface NotificationRow { id: UUID; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

export interface ActivityLog {
  id: number; actor_id: UUID | null; entity_type: string; entity_id: UUID; entity_label: string | null; action: string; summary: string;
  old_status: string | null; new_status: string | null; changes: Record<string, unknown> | null; created_at: string;
  actor?: { full_name: string; email: string } | null;
}

export interface BookingBalanceRow {
  booking_id: UUID; booking_code: string; customer_id: UUID; status: BookingStatus; total_amount: Numeric; currency: string;
  departure_date: string; amount_received: Numeric; amount_refunded: Numeric; amount_pending: Numeric; outstanding: Numeric;
}
