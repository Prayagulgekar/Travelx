-- Row-Level Security. Every table is tenant-scoped through private.current_agency_id().
--
-- Visibility model
--   owner / admin : every record in their agency
--   agent         : enquiries assigned to or created by them, plus quotations, bookings and
--                   itineraries that hang off those enquiries; customers assigned to/created by
--                   them or linked to one of their enquiries. No access to payments or refunds.
-- Write rules beyond row visibility (status machines, approvals) live in triggers.

grant usage on schema private to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from anon;
grant select, insert, update, delete on private.agency_counters to authenticated, service_role;

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.agency_members enable row level security;
alter table public.customers enable row level security;
alter table public.customer_notes enable row level security;
alter table public.enquiries enable row level security;
alter table public.enquiry_notes enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_travellers enable row level security;
alter table public.itineraries enable row level security;
alter table public.itinerary_days enable row level security;
alter table public.itinerary_activities enable row level security;
alter table public.payments enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

-- The anonymous role never touches application tables.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke insert, update, delete on public.activity_logs from authenticated;
revoke insert, delete on public.notifications from authenticated;

-- Agencies ------------------------------------------------------------------
create policy agencies_select on public.agencies for select to authenticated
  using (id = private.current_agency_id());
create policy agencies_update on public.agencies for update to authenticated
  using (id = private.current_agency_id() and private.is_owner())
  with check (id = private.current_agency_id());

-- Profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.agency_members m where m.user_id = profiles.id and m.agency_id = private.current_agency_id()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Members -------------------------------------------------------------------
create policy members_select on public.agency_members for select to authenticated
  using (agency_id = private.current_agency_id() or user_id = auth.uid());
create policy members_update on public.agency_members for update to authenticated
  using (agency_id = private.current_agency_id() and private.is_manager())
  with check (agency_id = private.current_agency_id());

-- Customers -----------------------------------------------------------------
create policy customers_select on public.customers for select to authenticated
  using (agency_id = private.current_agency_id() and (
    private.is_manager() or assigned_to = auth.uid() or created_by = auth.uid()
    or exists (select 1 from public.enquiries e where e.customer_id = customers.id and e.assigned_to = auth.uid())));
create policy customers_insert on public.customers for insert to authenticated
  with check (agency_id = private.current_agency_id());
create policy customers_update on public.customers for update to authenticated
  using (agency_id = private.current_agency_id() and (private.is_manager() or assigned_to = auth.uid() or created_by = auth.uid()))
  with check (agency_id = private.current_agency_id());

create policy customer_notes_select on public.customer_notes for select to authenticated
  using (agency_id = private.current_agency_id() and exists (select 1 from public.customers c where c.id = customer_notes.customer_id));
create policy customer_notes_insert on public.customer_notes for insert to authenticated
  with check (agency_id = private.current_agency_id() and author_id = auth.uid()
    and exists (select 1 from public.customers c where c.id = customer_notes.customer_id));

-- Enquiries -----------------------------------------------------------------
create policy enquiries_select on public.enquiries for select to authenticated
  using (agency_id = private.current_agency_id() and (private.is_manager() or assigned_to = auth.uid() or created_by = auth.uid()));
create policy enquiries_insert on public.enquiries for insert to authenticated
  with check (agency_id = private.current_agency_id());
create policy enquiries_update on public.enquiries for update to authenticated
  using (agency_id = private.current_agency_id() and (private.is_manager() or assigned_to = auth.uid() or created_by = auth.uid()))
  with check (agency_id = private.current_agency_id());

create policy enquiry_notes_select on public.enquiry_notes for select to authenticated
  using (agency_id = private.current_agency_id() and exists (select 1 from public.enquiries e where e.id = enquiry_notes.enquiry_id));
create policy enquiry_notes_insert on public.enquiry_notes for insert to authenticated
  with check (agency_id = private.current_agency_id() and author_id = auth.uid()
    and exists (select 1 from public.enquiries e where e.id = enquiry_notes.enquiry_id));

-- Quotations ----------------------------------------------------------------
create policy quotations_select on public.quotations for select to authenticated
  using (agency_id = private.current_agency_id() and (
    private.is_manager() or created_by = auth.uid()
    or exists (select 1 from public.enquiries e where e.id = quotations.enquiry_id)));
create policy quotations_insert on public.quotations for insert to authenticated
  with check (agency_id = private.current_agency_id()
    and exists (select 1 from public.enquiries e where e.id = quotations.enquiry_id));
create policy quotations_update on public.quotations for update to authenticated
  using (agency_id = private.current_agency_id() and (
    private.is_manager() or created_by = auth.uid()
    or exists (select 1 from public.enquiries e where e.id = quotations.enquiry_id)))
  with check (agency_id = private.current_agency_id());
create policy quotations_delete on public.quotations for delete to authenticated
  using (agency_id = private.current_agency_id() and status = 'draft' and (private.is_manager() or created_by = auth.uid()));

create policy quotation_items_all on public.quotation_items for all to authenticated
  using (agency_id = private.current_agency_id() and exists (select 1 from public.quotations q where q.id = quotation_items.quotation_id))
  with check (exists (select 1 from public.quotations q where q.id = quotation_items.quotation_id));

-- Bookings ------------------------------------------------------------------
create policy bookings_select on public.bookings for select to authenticated
  using (agency_id = private.current_agency_id() and (
    private.is_manager() or assigned_to = auth.uid()
    or exists (select 1 from public.enquiries e where e.id = bookings.enquiry_id)));
create policy bookings_insert on public.bookings for insert to authenticated
  with check (agency_id = private.current_agency_id()
    and exists (select 1 from public.quotations q where q.id = bookings.quotation_id));
create policy bookings_update on public.bookings for update to authenticated
  using (agency_id = private.current_agency_id() and (private.is_manager() or assigned_to = auth.uid()))
  with check (agency_id = private.current_agency_id());

create policy booking_travellers_all on public.booking_travellers for all to authenticated
  using (agency_id = private.current_agency_id() and exists (select 1 from public.bookings b where b.id = booking_travellers.booking_id))
  with check (exists (select 1 from public.bookings b where b.id = booking_travellers.booking_id));

-- Itineraries ---------------------------------------------------------------
create policy itineraries_select on public.itineraries for select to authenticated
  using (agency_id = private.current_agency_id() and (
    private.is_manager() or created_by = auth.uid()
    or (enquiry_id is not null and exists (select 1 from public.enquiries e where e.id = itineraries.enquiry_id))
    or (booking_id is not null and exists (select 1 from public.bookings b where b.id = itineraries.booking_id))));
create policy itineraries_insert on public.itineraries for insert to authenticated
  with check (agency_id = private.current_agency_id());
create policy itineraries_update on public.itineraries for update to authenticated
  using (agency_id = private.current_agency_id() and (
    private.is_manager() or created_by = auth.uid()
    or (enquiry_id is not null and exists (select 1 from public.enquiries e where e.id = itineraries.enquiry_id))))
  with check (agency_id = private.current_agency_id());
create policy itineraries_delete on public.itineraries for delete to authenticated
  using (agency_id = private.current_agency_id() and (private.is_manager() or created_by = auth.uid()));

create policy itinerary_days_all on public.itinerary_days for all to authenticated
  using (agency_id = private.current_agency_id() and exists (select 1 from public.itineraries i where i.id = itinerary_days.itinerary_id))
  with check (exists (select 1 from public.itineraries i where i.id = itinerary_days.itinerary_id));
create policy itinerary_activities_all on public.itinerary_activities for all to authenticated
  using (agency_id = private.current_agency_id() and exists (select 1 from public.itinerary_days d where d.id = itinerary_activities.day_id))
  with check (exists (select 1 from public.itinerary_days d where d.id = itinerary_activities.day_id));

-- Payments (owner/admin only) ----------------------------------------------
create policy payments_select on public.payments for select to authenticated
  using (agency_id = private.current_agency_id() and private.is_manager());
create policy payments_insert on public.payments for insert to authenticated
  with check (agency_id = private.current_agency_id() and private.is_manager());
create policy payments_update on public.payments for update to authenticated
  using (agency_id = private.current_agency_id() and private.is_manager())
  with check (agency_id = private.current_agency_id());

create policy refunds_select on public.payment_refunds for select to authenticated
  using (agency_id = private.current_agency_id() and private.is_manager());
create policy refunds_insert on public.payment_refunds for insert to authenticated
  with check (agency_id = private.current_agency_id() and private.is_owner());

-- Notifications -------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and agency_id = private.current_agency_id());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Activity logs -------------------------------------------------------------
-- Managers see everything; agents see history of records they can already see (never payments).
create or replace function private.agent_can_see_entity(p_type text, p_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case p_type
    when 'enquiry' then exists (select 1 from public.enquiries where id = p_id)
    when 'quotation' then exists (select 1 from public.quotations where id = p_id)
    when 'booking' then exists (select 1 from public.bookings where id = p_id)
    when 'customer' then exists (select 1 from public.customers where id = p_id)
    when 'itinerary' then exists (select 1 from public.itineraries where id = p_id)
    else false end
$$;
grant execute on function private.agent_can_see_entity(text, uuid) to authenticated;

create policy activity_logs_select on public.activity_logs for select to authenticated
  using (agency_id = private.current_agency_id() and (
    private.is_manager() or private.agent_can_see_entity(entity_type, entity_id)));

-- RPC functions are callable by signed-in users only.
grant execute on function public.convert_quotation_to_booking(uuid, text) to authenticated;
grant execute on function public.duplicate_quotation(uuid) to authenticated;
grant execute on function public.save_quotation_items(uuid, jsonb) to authenticated;
grant execute on function public.move_itinerary_activity(uuid, text) to authenticated;
grant execute on function public.run_daily_maintenance() to service_role;
