# TravelX database

PostgreSQL (Supabase). The schema is defined in `supabase/migrations` and applied in filename order:

| File | Contents |
|---|---|
| `…0100_core_schema.sql` | enums, tables, constraints, indexes |
| `…0200_logic.sql` | helper functions, triggers (tenancy, status machines, totals, locks, audit, notifications), RPCs, daily maintenance |
| `…0300_rls.sql` | grants and Row-Level Security policies |
| `…0400_reporting.sql` | `dashboard_metrics`, `monthly_performance`, `report_summary`, the `booking_balances` view, and function grants |
| `…0500_quotation_rpc.sql` | `save_quotation`, which saves the header, items and discount atomically |
| `…0600_hardening.sql` | lifecycle guards (accepted snapshot and status timestamps can't be written directly), profile email lock and sync, the shared rate limiter `rate_limit_hit` (service role only), revoked counter grants, and indexes for RLS filters and user foreign keys |

## Relationships

```
agencies 1─* agency_members *─1 profiles 1─1 auth.users
agencies 1─* customers 1─* enquiries 1─* quotations 1─* quotation_items
                                         quotations 1─0..1 bookings (from the accepted quotation)
customers 1─* customer_notes      enquiries 1─* enquiry_notes
bookings 1─* booking_travellers   bookings 1─* payments 1─* payment_refunds
itineraries (→ enquiry / quotation / booking, all optional) 1─* itinerary_days 1─* itinerary_activities
agencies 1─* notifications (per user)   agencies 1─* activity_logs (entity_type, entity_id)
private.agency_counters: per-agency sequences for human-readable codes
```

Every business table carries `agency_id` (FK to `agencies`), which a trigger fills in from the caller's membership. Most tables
also carry `created_by`, `created_at`, `updated_at` and `updated_by`.

## Tables

| Table | Purpose | Notable columns and constraints |
|---|---|---|
| `agencies` | Tenant | name, currency, default_tax_rate (5.00), max_agent_discount_percent (10.00), quotation validity days, terms |
| `profiles` | User display data | full_name, email; created by the auth trigger |
| `agency_members` | Membership and role | user_id **unique** (one agency per user), role `owner/admin/agent`, status `invited/active/suspended` |
| `customers` | Customer records | customer_code `CUS-000001`, full_name, phone and email (citext), each unique per agency among non-archived customers, assigned_to, archived_at |
| `enquiries` | Travel requests | enquiry_code, customer_id, destination, departure/return dates (return ≥ departure), generated `duration_nights`, adults ≥ 1, children, infants, rooms, budget, priority, status, assigned_to, idempotency_key (unique) |
| `quotations` | Priced proposals | quotation_code, enquiry_id, status, issue_date, valid_until, discount_type/value, subtotal/tax_amount/discount_amount/grand_total (**computed in the database**), `accepted_snapshot jsonb`, reviewed/accepted/rejected timestamps; at most one accepted quotation per enquiry |
| `quotation_items` | Line items | category, description, quantity > 0, unit_price ≥ 0, tax_rate 0–100, generated line_subtotal/line_tax/line_total, position |
| `bookings` | Confirmed trips | booking_code, quotation_id (**unique**), enquiry_id, customer_id, total_amount (from the snapshot), status, dates, cancellation_reason, confirmed/completed/cancelled timestamps |
| `booking_travellers` | Traveller list | full_name, traveller_type, date_of_birth, nationality |
| `itineraries`, `itinerary_days`, `itinerary_activities` | Day-wise plans | day_number, date, ordered activities with time, duration and location |
| `payments` | Manual payment records | payment_code, booking_id, amount > 0, method, status `pending/received/failed/partially_refunded/refunded`, payment_date, transaction_reference (unique per agency and method, case-insensitive, when set), refunded_amount, idempotency_key |
| `payment_refunds` | Refunds | amount > 0, refund_date, reason (required), reference; cannot be updated or deleted |
| `notifications` | In-app inbox | user_id, type, title, body, link, read_at, dedupe_key (unique per user) |
| `activity_logs` | Audit trail | entity_type, entity_id, action, actor_id, changes `jsonb` (before → after diff); append-only |

## Status machines (enforced by triggers)

- **Enquiry:** new → contacted → requirements_pending → quotation_in_progress → quotation_sent → converted; lost or cancelled (with a reason) from any open state. Quotation and booking events advance the enquiry automatically.
- **Quotation:** draft → reviewed (owner/admin) → sent → accepted / rejected / expired; reviewed → draft. Only `draft` rows and their items can be edited. Accepting stores `accepted_snapshot`. A sent quotation past `valid_until` can't be accepted, and the daily job marks it expired.
- **Booking:** pending_confirmation → confirmed → in_progress → completed; cancelled (with a reason, owner/admin) from pending or confirmed. Completed and cancelled are final.
- **Payment:** pending → received or failed; received → partially_refunded → refunded, driven by refunds. Payments can't be deleted. Received amounts can't push the net paid above the booking total.

## RPC functions (callable by authenticated users unless noted)

| Function | Purpose |
|---|---|
| `save_quotation(id, header, items)` / `save_quotation_items` | Atomic save of a draft quotation; totals are recomputed in the database |
| `duplicate_quotation(id)` | Copies a quotation and its items as a new draft |
| `convert_quotation_to_booking(id, notes)` | Creates the booking from the accepted snapshot (once per quotation) |
| `move_itinerary_activity(id, direction)` | Reorders activities |
| `dashboard_metrics(from, to)`, `monthly_performance(months)`, `report_summary(from, to)` | Reporting; SECURITY INVOKER, so RLS applies and financial figures are null for agents |
| `rate_limit_hit(key, limit, window_seconds)` | **service_role only**. Atomic fixed-window counter shared by all app servers |
| `run_daily_maintenance()` | **service_role only**. Expires quotations and creates upcoming-trip notifications (deduplicated) |

## Security model

- RLS is enabled on every table. `anon` has no table or function privileges.
- `private.*` helper functions (`current_agency_id`, `current_member_role`, `is_manager`, `is_owner`) are `SECURITY DEFINER` with an empty `search_path`.
- Agents can read customers, enquiries, quotations, bookings and itineraries only when they are assigned to them or created by them, or derived from such an enquiry. They cannot read payments or refunds.
- There are no delete policies on payments, refunds, members or activity logs. Delete triggers block service-role deletes of payments and refunds too.
