-- Production-readiness hardening (review of 2026-11-01).
--  1. Lifecycle columns (accepted price snapshot, review/accept/cancel timestamps and actors) can only
--     be set by the status-transition logic, never written directly by a client.
--  2. Profile email mirrors auth.users and cannot be edited through the API.
--  3. Shared, database-backed rate limiter for the app servers (replaces per-instance memory).
--  4. Least-privilege cleanup and indexes for RLS filters and user foreign keys.

-- 1. Lifecycle guards ---------------------------------------------------------
-- Trigger names sort before "<table>_before", so these run first and the existing status logic then
-- sets the columns legitimately when a transition happens.
create or replace function private.tg_quotations_lifecycle_guard()
returns trigger language plpgsql as $$
begin
  new.accepted_snapshot := old.accepted_snapshot;
  new.reviewed_at := old.reviewed_at;
  new.reviewed_by := old.reviewed_by;
  new.sent_at := old.sent_at;
  new.accepted_at := old.accepted_at;
  new.rejected_at := old.rejected_at;
  new.expired_at := old.expired_at;
  new.created_at := old.created_at;
  if not (new.status = 'rejected' and old.status <> 'rejected') then
    new.rejection_reason := old.rejection_reason;
  end if;
  return new;
end $$;
create trigger quotations_a_lifecycle_guard before update on public.quotations
  for each row execute function private.tg_quotations_lifecycle_guard();

create or replace function private.tg_bookings_lifecycle_guard()
returns trigger language plpgsql as $$
begin
  new.confirmed_at := old.confirmed_at;
  new.completed_at := old.completed_at;
  new.cancelled_at := old.cancelled_at;
  new.cancelled_by := old.cancelled_by;
  new.created_at := old.created_at;
  if not (new.status = 'cancelled' and old.status <> 'cancelled') then
    new.cancellation_reason := old.cancellation_reason;
  end if;
  return new;
end $$;
create trigger bookings_a_lifecycle_guard before update on public.bookings
  for each row execute function private.tg_bookings_lifecycle_guard();

create or replace function private.tg_payments_lifecycle_guard()
returns trigger language plpgsql as $$
begin
  new.created_at := old.created_at;
  return new;
end $$;
create trigger payments_a_lifecycle_guard before update on public.payments
  for each row execute function private.tg_payments_lifecycle_guard();

-- 2. Profile email ------------------------------------------------------------
create or replace function private.tg_profiles_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.email := old.email;
    new.id := old.id;
  end if;
  return new;
end $$;
create trigger profiles_a_guard before update on public.profiles
  for each row execute function private.tg_profiles_guard();

create or replace function private.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.sync_profile_email();

-- 3. Shared rate limiter ------------------------------------------------------
-- UNLOGGED: counters are disposable, so they skip WAL; losing them on a crash only resets limits.
create unlogged table if not exists private.rate_limits (
  key text primary key check (char_length(key) <= 200),
  hits integer not null,
  reset_at timestamptz not null
);
create index if not exists rate_limits_reset_idx on private.rate_limits (reset_at);

-- Fixed-window counter. Atomic: the upsert takes a row lock, so concurrent requests on any server
-- instance are counted exactly once each. Keys are hashed by the app (no raw emails or IPs stored).
-- p_consume = false only checks the current window (used to count failed sign-ins only).
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer, p_consume boolean default true)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_hits integer;
  v_reset timestamptz;
begin
  if p_key is null or char_length(p_key) > 200 or p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  if not p_consume then
    select r.hits, r.reset_at into v_hits, v_reset from private.rate_limits r where r.key = p_key;
    if v_hits is null or v_reset <= now() or v_hits < p_limit then
      return query select true, 0;
    else
      return query select false, greatest(ceil(extract(epoch from (v_reset - now())))::integer, 0);
    end if;
    return;
  end if;

  insert into private.rate_limits as r (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    hits = case when r.reset_at <= now() then 1 else r.hits + 1 end,
    reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning r.hits, r.reset_at into v_hits, v_reset;

  -- Opportunistic cleanup keeps the table small without a separate job.
  if random() < 0.02 then
    delete from private.rate_limits where reset_at < now() - interval '1 hour';
  end if;

  return query select v_hits <= p_limit, greatest(ceil(extract(epoch from (v_reset - now())))::integer, 0);
end $$;

revoke all on private.rate_limits from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer, boolean) to service_role;

-- 4. Least privilege and indexes ----------------------------------------------
-- Codes are generated by the SECURITY DEFINER function private.next_code; users need no direct access.
revoke all on private.agency_counters from authenticated;
revoke execute on function private.tg_quotations_lifecycle_guard() from public;
revoke execute on function private.tg_bookings_lifecycle_guard() from public;
revoke execute on function private.tg_payments_lifecycle_guard() from public;
revoke execute on function private.tg_profiles_guard() from public;
revoke execute on function private.sync_profile_email() from public, anon, authenticated;

-- Columns used by RLS policies for agents ("assigned to me" / "created by me").
create index if not exists customers_created_by_idx on public.customers (created_by);
create index if not exists enquiries_created_by_idx on public.enquiries (created_by);
create index if not exists quotations_created_by_idx on public.quotations (created_by);
create index if not exists itineraries_created_by_idx on public.itineraries (created_by);
create index if not exists quotations_duplicated_from_idx on public.quotations (duplicated_from) where duplicated_from is not null;
create index if not exists activity_logs_actor_idx on public.activity_logs (actor_id);

-- Foreign keys to auth.users with ON DELETE SET NULL: indexed so deleting a user does not scan tables.
create index if not exists agencies_updated_by_idx on public.agencies (updated_by) where updated_by is not null;
create index if not exists members_invited_by_idx on public.agency_members (invited_by) where invited_by is not null;
create index if not exists bookings_cancelled_by_idx on public.bookings (cancelled_by) where cancelled_by is not null;
create index if not exists bookings_created_by_idx on public.bookings (created_by);
create index if not exists bookings_updated_by_idx on public.bookings (updated_by) where updated_by is not null;
create index if not exists customer_notes_author_idx on public.customer_notes (author_id);
create index if not exists customers_archived_by_idx on public.customers (archived_by) where archived_by is not null;
create index if not exists customers_updated_by_idx on public.customers (updated_by) where updated_by is not null;
create index if not exists enquiries_updated_by_idx on public.enquiries (updated_by) where updated_by is not null;
create index if not exists enquiry_notes_author_idx on public.enquiry_notes (author_id);
create index if not exists itineraries_updated_by_idx on public.itineraries (updated_by) where updated_by is not null;
create index if not exists refunds_recorded_by_idx on public.payment_refunds (recorded_by);
create index if not exists payments_recorded_by_idx on public.payments (recorded_by);
create index if not exists payments_updated_by_idx on public.payments (updated_by) where updated_by is not null;
create index if not exists quotations_reviewed_by_idx on public.quotations (reviewed_by) where reviewed_by is not null;
create index if not exists quotations_updated_by_idx on public.quotations (updated_by) where updated_by is not null;
