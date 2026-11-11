-- TravelX core schema
-- Tenancy model: every business record carries agency_id. A user belongs to exactly one
-- agency workspace (agency_members.user_id is unique). Access is enforced by RLS (see
-- 20261101000300_rls.sql) and business rules by triggers (20261101000200_logic.sql).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'agent');
create type public.member_status as enum ('invited', 'active', 'suspended');
create type public.enquiry_status as enum (
  'new', 'contacted', 'requirements_pending', 'quotation_in_progress',
  'quotation_sent', 'converted', 'lost', 'cancelled'
);
create type public.enquiry_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.quotation_status as enum ('draft', 'reviewed', 'sent', 'accepted', 'rejected', 'expired');
create type public.quotation_item_category as enum (
  'transportation', 'accommodation', 'meals', 'activities', 'sightseeing',
  'guide', 'additional_services', 'taxes_fees', 'other'
);
create type public.discount_type as enum ('none', 'fixed', 'percent');
create type public.booking_status as enum ('pending_confirmation', 'confirmed', 'in_progress', 'completed', 'cancelled');
create type public.traveller_type as enum ('adult', 'child', 'infant');
create type public.payment_status as enum ('pending', 'received', 'failed', 'refunded', 'partially_refunded');
create type public.payment_method as enum ('cash', 'bank_transfer', 'upi', 'cheque', 'card_terminal', 'other');

-- ---------------------------------------------------------------------------
-- Agencies, profiles and membership
-- ---------------------------------------------------------------------------
create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  legal_name text check (char_length(legal_name) <= 160),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 32),
  website text check (char_length(website) <= 200),
  address text check (char_length(address) <= 300),
  city text check (char_length(city) <= 80),
  country text check (char_length(country) <= 80),
  tax_id text check (char_length(tax_id) <= 40),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  default_tax_rate numeric(5,2) not null default 5.00 check (default_tax_rate between 0 and 100),
  max_agent_discount_percent numeric(5,2) not null default 10.00 check (max_agent_discount_percent between 0 and 100),
  quotation_validity_days integer not null default 14 check (quotation_validity_days between 1 and 365),
  quotation_terms text check (char_length(quotation_terms) <= 5000),
  payment_terms text check (char_length(payment_terms) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null,
  phone text check (char_length(phone) <= 32),
  job_title text check (char_length(job_title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'agent',
  status public.member_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_members_one_agency_per_user unique (user_id),
  constraint agency_members_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade
);
create index agency_members_agency_idx on public.agency_members (agency_id, role);

-- Per-agency human readable sequence numbers (ENQ-000001 ...)
create table private.agency_counters (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  entity text not null,
  value bigint not null default 0,
  primary key (agency_id, entity)
);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  customer_code text not null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (char_length(phone) between 7 and 32),
  phone_normalized text not null check (phone_normalized ~ '^\+?[0-9]{7,15}$'),
  email extensions.citext check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  address text check (char_length(address) <= 300),
  city text check (char_length(city) <= 80),
  country text check (char_length(country) <= 80),
  source text check (source in ('walk_in', 'phone', 'website', 'referral', 'social_media', 'email', 'partner', 'repeat', 'other')),
  notes text check (char_length(notes) <= 4000),
  assigned_to uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_code_unique unique (agency_id, customer_code)
);
create unique index customers_phone_unique on public.customers (agency_id, phone_normalized) where archived_at is null;
create unique index customers_email_unique on public.customers (agency_id, email) where archived_at is null and email is not null;
create index customers_agency_name_idx on public.customers (agency_id, lower(full_name));
create index customers_assigned_idx on public.customers (agency_id, assigned_to);
create index customers_created_idx on public.customers (agency_id, created_at desc);

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Enquiries
-- ---------------------------------------------------------------------------
create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  enquiry_code text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_location text not null check (char_length(source_location) between 2 and 120),
  destination text not null check (char_length(destination) between 2 and 120),
  departure_date date not null,
  return_date date not null,
  adults smallint not null default 1 check (adults between 1 and 99),
  children smallint not null default 0 check (children between 0 and 99),
  infants smallint not null default 0 check (infants between 0 and 20),
  rooms smallint not null default 1 check (rooms between 1 and 50),
  duration_nights integer generated always as (return_date - departure_date) stored,
  budget numeric(14,2) check (budget is null or budget >= 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  travel_category text check (travel_category in ('leisure', 'honeymoon', 'family', 'business', 'pilgrimage', 'adventure', 'group', 'educational', 'other')),
  preferred_transport text check (preferred_transport in ('flight', 'train', 'bus', 'car', 'cruise', 'mixed', 'none')),
  accommodation_preference text check (char_length(accommodation_preference) <= 300),
  special_requirements text check (char_length(special_requirements) <= 2000),
  assigned_to uuid references auth.users(id) on delete set null,
  priority public.enquiry_priority not null default 'medium',
  status public.enquiry_status not null default 'new',
  status_reason text check (char_length(status_reason) <= 500),
  idempotency_key uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enquiries_code_unique unique (agency_id, enquiry_code),
  constraint enquiries_idempotency_unique unique (agency_id, idempotency_key),
  constraint enquiries_date_range check (return_date >= departure_date),
  constraint enquiries_infants_need_adults check (infants <= adults * 2)
);
create index enquiries_agency_status_idx on public.enquiries (agency_id, status, created_at desc);
create index enquiries_assigned_idx on public.enquiries (agency_id, assigned_to);
create index enquiries_customer_idx on public.enquiries (customer_id);
create index enquiries_departure_idx on public.enquiries (agency_id, departure_date);
create index enquiries_destination_idx on public.enquiries (agency_id, lower(destination));

create table public.enquiry_notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index enquiry_notes_enquiry_idx on public.enquiry_notes (enquiry_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  quotation_code text not null,
  enquiry_id uuid not null references public.enquiries(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 160),
  status public.quotation_status not null default 'draft',
  issue_date date not null default current_date,
  valid_until date not null,
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  discount_type public.discount_type not null default 'none',
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  -- Totals are always computed by the database from quotation_items (see private.quotation_compute_totals).
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  terms text check (char_length(terms) <= 5000),
  payment_terms text check (char_length(payment_terms) <= 3000),
  internal_notes text check (char_length(internal_notes) <= 3000),
  duplicated_from uuid references public.quotations(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 500),
  accepted_snapshot jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotations_code_unique unique (agency_id, quotation_code),
  constraint quotations_validity check (valid_until >= issue_date),
  constraint quotations_percent_discount check (discount_type <> 'percent' or discount_value <= 100),
  constraint quotations_totals_consistent check (grand_total = subtotal + tax_amount - discount_amount and discount_amount >= 0 and discount_amount <= subtotal),
  constraint quotations_accept_snapshot check (status <> 'accepted' or accepted_snapshot is not null)
);
create unique index quotations_one_accepted_per_enquiry on public.quotations (enquiry_id) where status = 'accepted';
create index quotations_agency_status_idx on public.quotations (agency_id, status, created_at desc);
create index quotations_enquiry_idx on public.quotations (enquiry_id);
create index quotations_customer_idx on public.quotations (customer_id);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  position integer not null default 0,
  category public.quotation_item_category not null,
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(10,2) not null check (quantity > 0 and quantity <= 100000),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_subtotal numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  line_tax numeric(14,2) generated always as (round(round(quantity * unit_price, 2) * tax_rate / 100, 2)) stored,
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2) + round(round(quantity * unit_price, 2) * tax_rate / 100, 2)) stored,
  created_at timestamptz not null default now()
);
create index quotation_items_quotation_idx on public.quotation_items (quotation_id, position);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  booking_code text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  enquiry_id uuid not null references public.enquiries(id) on delete restrict,
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  destination text not null,
  departure_date date not null,
  return_date date not null,
  status public.booking_status not null default 'pending_confirmation',
  assigned_to uuid references auth.users(id) on delete set null,
  -- Price agreed in the accepted quotation; copied once and never recalculated.
  total_amount numeric(14,2) not null check (total_amount >= 0),
  currency char(3) not null,
  quotation_snapshot jsonb not null,
  notes text check (char_length(notes) <= 4000),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text check (char_length(cancellation_reason) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_code_unique unique (agency_id, booking_code),
  constraint bookings_one_per_quotation unique (quotation_id),
  constraint bookings_date_range check (return_date >= departure_date),
  constraint bookings_cancel_reason check (status <> 'cancelled' or (cancellation_reason is not null and char_length(cancellation_reason) >= 3))
);
create index bookings_agency_status_idx on public.bookings (agency_id, status, departure_date);
create index bookings_assigned_idx on public.bookings (agency_id, assigned_to);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_enquiry_idx on public.bookings (enquiry_id);

create table public.booking_travellers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  traveller_type public.traveller_type not null default 'adult',
  date_of_birth date check (date_of_birth is null or date_of_birth <= current_date),
  nationality text check (char_length(nationality) <= 80),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index booking_travellers_booking_idx on public.booking_travellers (booking_id);

-- ---------------------------------------------------------------------------
-- Itineraries
-- ---------------------------------------------------------------------------
create table public.itineraries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  enquiry_id uuid references public.enquiries(id) on delete set null,
  quotation_id uuid references public.quotations(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  destination text not null check (char_length(destination) between 2 and 120),
  start_date date not null,
  end_date date not null,
  notes text check (char_length(notes) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itineraries_date_range check (end_date >= start_date and end_date - start_date <= 120)
);
create index itineraries_agency_idx on public.itineraries (agency_id, start_date desc);
create index itineraries_enquiry_idx on public.itineraries (enquiry_id);
create index itineraries_quotation_idx on public.itineraries (quotation_id);
create index itineraries_booking_idx on public.itineraries (booking_id);

create table public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 121),
  day_date date,
  title text check (char_length(title) <= 160),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  constraint itinerary_days_unique unique (itinerary_id, day_number)
);

create table public.itinerary_activities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  day_id uuid not null references public.itinerary_days(id) on delete cascade,
  position integer not null default 0,
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 2000),
  location text check (char_length(location) <= 160),
  start_time time,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index itinerary_activities_day_idx on public.itinerary_activities (day_id, position);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  payment_code text not null,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null,
  method public.payment_method not null,
  transaction_reference text check (char_length(transaction_reference) between 2 and 80),
  payment_date date not null default current_date,
  status public.payment_status not null default 'received',
  refunded_amount numeric(14,2) not null default 0 check (refunded_amount >= 0),
  notes text check (char_length(notes) <= 1000),
  idempotency_key uuid,
  recorded_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_code_unique unique (agency_id, payment_code),
  constraint payments_idempotency_unique unique (agency_id, idempotency_key),
  constraint payments_refund_le_amount check (refunded_amount <= amount),
  constraint payments_date_sane check (payment_date <= current_date + 1)
);
create unique index payments_reference_unique on public.payments (agency_id, method, lower(transaction_reference)) where transaction_reference is not null;
create index payments_booking_idx on public.payments (booking_id);
create index payments_agency_date_idx on public.payments (agency_id, payment_date desc);
create index payments_customer_idx on public.payments (customer_id);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  refund_date date not null default current_date,
  reason text not null check (char_length(reason) between 3 and 500),
  reference text check (char_length(reference) <= 80),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payment_refunds_payment_idx on public.payment_refunds (payment_id);
create index payment_refunds_agency_date_idx on public.payment_refunds (agency_id, refund_date);

-- ---------------------------------------------------------------------------
-- Notifications and activity history
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_dedupe unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null check (entity_type in ('agency', 'member', 'customer', 'enquiry', 'quotation', 'booking', 'payment', 'refund', 'itinerary')),
  entity_id uuid not null,
  entity_label text,
  parent_entity_id uuid,
  action text not null,
  summary text not null,
  old_status text,
  new_status text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_entity_idx on public.activity_logs (entity_id, created_at desc);
create index activity_logs_parent_idx on public.activity_logs (parent_entity_id, created_at desc) where parent_entity_id is not null;
create index activity_logs_agency_idx on public.activity_logs (agency_id, created_at desc);
