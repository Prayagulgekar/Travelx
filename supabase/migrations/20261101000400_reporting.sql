-- Reporting functions. All are SECURITY INVOKER so RLS decides which rows are counted:
-- an agent's dashboard reflects only their own work, and financial figures are null for agents.
--
-- Metric definitions (also shown in the UI):
--   Revenue (recorded)   = sum(payments.amount where status in received/partially_refunded/refunded and payment_date in range)
--                          - sum(payment_refunds.amount where refund_date in range). Pending/failed payments never count.
--   Outstanding balance  = for every non-cancelled booking: total_amount - (received amounts - refunds). Never negative.
--   Quotation value      = grand_total of quotations (pipeline only, never treated as revenue).
--   Confirmed booking value = total_amount of bookings in confirmed/in_progress/completed.
--   Conversion rate      = enquiries created in range that reached "converted" / enquiries created in range.

create or replace function public.dashboard_metrics(p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_manager boolean := private.is_manager();
  v_result jsonb;
begin
  select jsonb_build_object(
    'total_enquiries', (select count(*) from public.enquiries where created_at::date between p_from and p_to),
    'new_enquiries', (select count(*) from public.enquiries where status = 'new'),
    'open_enquiries', (select count(*) from public.enquiries where status not in ('converted', 'lost', 'cancelled')),
    'pending_quotations', (select count(*) from public.quotations where status in ('draft', 'reviewed')),
    'awaiting_response', (select count(*) from public.quotations where status = 'sent' and valid_until >= current_date),
    'confirmed_bookings', (select count(*) from public.bookings where status = 'confirmed'),
    'pending_bookings', (select count(*) from public.bookings where status = 'pending_confirmation'),
    'in_progress_bookings', (select count(*) from public.bookings where status = 'in_progress'),
    'upcoming_trips', (select count(*) from public.bookings
                       where status in ('pending_confirmation', 'confirmed') and departure_date between current_date and current_date + 30),
    'completed_bookings', (select count(*) from public.bookings where status = 'completed' and completed_at::date between p_from and p_to),
    'cancelled_bookings', (select count(*) from public.bookings where status = 'cancelled' and cancelled_at::date between p_from and p_to),
    'revenue', case when v_manager then (
        (select coalesce(sum(amount), 0) from public.payments
          where status in ('received', 'partially_refunded', 'refunded') and payment_date between p_from and p_to)
        - (select coalesce(sum(amount), 0) from public.payment_refunds where refund_date between p_from and p_to)) end,
    'refunds', case when v_manager then
        (select coalesce(sum(amount), 0) from public.payment_refunds where refund_date between p_from and p_to) end,
    'pending_payments', case when v_manager then
        (select coalesce(sum(amount), 0) from public.payments where status = 'pending') end,
    'outstanding', case when v_manager then (
        select coalesce(sum(greatest(b.total_amount - coalesce(p.net, 0), 0)), 0)
        from public.bookings b
        left join (select booking_id, sum(amount - refunded_amount) as net from public.payments
                   where status in ('received', 'partially_refunded', 'refunded') group by booking_id) p on p.booking_id = b.id
        where b.status <> 'cancelled') end,
    'is_manager', v_manager
  ) into v_result;
  return v_result;
end $$;

create or replace function public.monthly_performance(p_months integer default 6)
returns table (month date, enquiries bigint, bookings bigint, revenue numeric)
language sql stable security invoker set search_path = '' as $$
  with months as (
    select (date_trunc('month', current_date) - make_interval(months => g))::date as month
    from generate_series(0, greatest(least(p_months, 24), 1) - 1) g
  )
  select m.month,
    (select count(*) from public.enquiries e where date_trunc('month', e.created_at)::date = m.month),
    (select count(*) from public.bookings b where date_trunc('month', b.created_at)::date = m.month),
    case when private.is_manager() then
      (select coalesce(sum(p.amount), 0) from public.payments p
        where p.status in ('received', 'partially_refunded', 'refunded') and date_trunc('month', p.payment_date)::date = m.month)
      - (select coalesce(sum(r.amount), 0) from public.payment_refunds r where date_trunc('month', r.refund_date)::date = m.month)
    end
  from months m
  order by m.month
$$;

create or replace function public.report_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_manager boolean := private.is_manager();
  v_owner boolean := private.is_owner();
  v_result jsonb;
begin
  select jsonb_build_object(
    'enquiries_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from public.enquiries where created_at::date between p_from and p_to group by status) s),
    'enquiries_total', (select count(*) from public.enquiries where created_at::date between p_from and p_to),
    'enquiries_converted', (select count(*) from public.enquiries where created_at::date between p_from and p_to and status = 'converted'),
    'enquiries_by_destination', (select coalesce(jsonb_agg(jsonb_build_object('destination', d, 'count', n, 'converted', c) order by n desc), '[]'::jsonb) from (
        select initcap(lower(destination)) d, count(*) n, count(*) filter (where status = 'converted') c
        from public.enquiries where created_at::date between p_from and p_to group by 1 order by 2 desc limit 10) s),
    'quotations_created', (select count(*) from public.quotations where created_at::date between p_from and p_to),
    'quotations_by_status', (select coalesce(jsonb_object_agg(status, jsonb_build_object('count', n, 'value', v)), '{}'::jsonb) from (
        select status, count(*) n, sum(grand_total) v from public.quotations where created_at::date between p_from and p_to group by status) s),
    'quotations_accepted', (select count(*) from public.quotations where accepted_at::date between p_from and p_to),
    'quotations_rejected', (select count(*) from public.quotations where rejected_at::date between p_from and p_to),
    'quotation_value', (select coalesce(sum(grand_total), 0) from public.quotations where created_at::date between p_from and p_to),
    'bookings_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from public.bookings where created_at::date between p_from and p_to group by status) s),
    'confirmed_booking_value', (select coalesce(sum(total_amount), 0) from public.bookings
        where status in ('confirmed', 'in_progress', 'completed') and created_at::date between p_from and p_to),
    'cancellations', (select coalesce(jsonb_agg(jsonb_build_object('code', booking_code, 'id', id, 'destination', destination,
        'reason', cancellation_reason, 'cancelled_at', cancelled_at, 'value', total_amount) order by cancelled_at desc), '[]'::jsonb)
        from public.bookings where status = 'cancelled' and cancelled_at::date between p_from and p_to),
    'collections_by_method', case when v_manager then (select coalesce(jsonb_object_agg(method, jsonb_build_object('count', n, 'amount', a)), '{}'::jsonb) from (
        select method, count(*) n, sum(amount) a from public.payments
        where status in ('received', 'partially_refunded', 'refunded') and payment_date between p_from and p_to group by method) s) end,
    'amount_received', case when v_manager then (select coalesce(sum(amount), 0) from public.payments
        where status in ('received', 'partially_refunded', 'refunded') and payment_date between p_from and p_to) end,
    'refunds', case when v_manager then (select coalesce(sum(amount), 0) from public.payment_refunds where refund_date between p_from and p_to) end,
    'employee_performance', (select coalesce(jsonb_agg(row_to_json(s) order by s.enquiries desc), '[]'::jsonb) from (
        select m.user_id, coalesce(nullif(p.full_name, ''), p.email) as name, m.role,
          (select count(*) from public.enquiries e where e.assigned_to = m.user_id and e.created_at::date between p_from and p_to) enquiries,
          (select count(*) from public.enquiries e where e.assigned_to = m.user_id and e.status = 'converted' and e.created_at::date between p_from and p_to) converted,
          (select count(*) from public.quotations q where q.created_by = m.user_id and q.created_at::date between p_from and p_to) quotations,
          (select count(*) from public.bookings b where b.assigned_to = m.user_id and b.created_at::date between p_from and p_to) bookings,
          (select coalesce(sum(b.total_amount), 0) from public.bookings b where b.assigned_to = m.user_id and b.status <> 'cancelled'
             and b.created_at::date between p_from and p_to) booking_value
        from public.agency_members m join public.profiles p on p.id = m.user_id
        where m.agency_id = private.current_agency_id() and m.status = 'active'
          and (v_manager or m.user_id = auth.uid())) s),
    'is_manager', v_manager,
    'is_owner', v_owner
  ) into v_result;
  return v_result;
end $$;

-- Outstanding balance per booking for the payments screens.
create or replace view public.booking_balances with (security_invoker = true) as
select b.id as booking_id, b.agency_id, b.booking_code, b.customer_id, b.status, b.total_amount, b.currency, b.departure_date,
  coalesce(sum(p.amount) filter (where p.status in ('received', 'partially_refunded', 'refunded')), 0)::numeric(14,2) as amount_received,
  coalesce(sum(p.refunded_amount), 0)::numeric(14,2) as amount_refunded,
  coalesce(sum(p.amount) filter (where p.status = 'pending'), 0)::numeric(14,2) as amount_pending,
  case when b.status = 'cancelled' then 0 else greatest(b.total_amount -
    (coalesce(sum(p.amount - p.refunded_amount) filter (where p.status in ('received', 'partially_refunded', 'refunded')), 0)), 0) end::numeric(14,2) as outstanding
from public.bookings b
left join public.payments p on p.booking_id = b.id
group by b.id;

revoke all on public.booking_balances from anon;
grant select on public.booking_balances to authenticated, service_role;
grant execute on function public.dashboard_metrics(date, date) to authenticated;
grant execute on function public.monthly_performance(integer) to authenticated;
grant execute on function public.report_summary(date, date) to authenticated;
revoke execute on function public.dashboard_metrics(date, date) from anon;
revoke execute on function public.monthly_performance(integer) from anon;
revoke execute on function public.report_summary(date, date) from anon;

-- Postgres grants EXECUTE to PUBLIC by default; remove it so only signed-in users can call
-- functions, and RLS/permission checks inside them decide the rest.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
grant execute on function public.convert_quotation_to_booking(uuid, text) to authenticated, service_role;
grant execute on function public.duplicate_quotation(uuid) to authenticated, service_role;
grant execute on function public.save_quotation_items(uuid, jsonb) to authenticated, service_role;
grant execute on function public.move_itinerary_activity(uuid, text) to authenticated, service_role;
grant execute on function public.dashboard_metrics(date, date) to authenticated, service_role;
grant execute on function public.monthly_performance(integer) to authenticated, service_role;
grant execute on function public.report_summary(date, date) to authenticated, service_role;
grant execute on function public.run_daily_maintenance() to service_role;
