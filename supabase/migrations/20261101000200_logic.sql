-- TravelX business rules enforced in the database.
-- The application layer validates the same rules first (src/lib/domain) for good UX, but the
-- database is the final authority: totals, status transitions, permissions and financial
-- invariants cannot be bypassed by calling the API directly.

-- ---------------------------------------------------------------------------
-- Session helpers (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function private.current_agency_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.agency_id from public.agency_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function private.current_member_role()
returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role from public.agency_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function private.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_member_role() in ('owner', 'admin'), false)
$$;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_member_role() = 'owner', false)
$$;

create or replace function private.is_active_member_of(p_agency uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agency_members m
                 where m.agency_id = p_agency and m.user_id = p_user and m.status = 'active')
$$;

-- Raise a business error with a stable code the app maps to a friendly message.
create or replace function private.fail(p_message text, p_code text default 'P0001')
returns void language plpgsql as $$
begin
  raise exception using message = p_message, errcode = p_code;
end $$;

create or replace function private.next_code(p_agency uuid, p_entity text, p_prefix text)
returns text language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into private.agency_counters as c (agency_id, entity, value) values (p_agency, p_entity, 1)
  on conflict (agency_id, entity) do update set value = c.value + 1
  returning value into v;
  return p_prefix || '-' || lpad(v::text, 6, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Activity log and notifications (only writable through these definer functions)
-- ---------------------------------------------------------------------------
create or replace function private.log_activity(
  p_agency uuid, p_entity_type text, p_entity_id uuid, p_label text, p_action text, p_summary text,
  p_old_status text default null, p_new_status text default null, p_changes jsonb default null,
  p_parent uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_logs (agency_id, actor_id, entity_type, entity_id, entity_label, parent_entity_id,
                                    action, summary, old_status, new_status, changes)
  values (p_agency, auth.uid(), p_entity_type, p_entity_id, p_label, p_parent, p_action, p_summary,
          p_old_status, p_new_status, nullif(p_changes, '{}'::jsonb));
end $$;

create or replace function private.notify(
  p_agency uuid, p_user uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = auth.uid() then
    return; -- do not notify people about their own actions
  end if;
  if not private.is_active_member_of(p_agency, p_user) then
    return;
  end if;
  insert into public.notifications (agency_id, user_id, type, title, body, link, dedupe_key)
  values (p_agency, p_user, p_type, p_title, p_body, p_link, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end $$;

create or replace function private.notify_managers(
  p_agency uuid, p_type text, p_title text, p_body text, p_link text, p_except uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select user_id from public.agency_members
           where agency_id = p_agency and status = 'active' and role in ('owner', 'admin')
             and user_id is distinct from p_except
  loop
    perform private.notify(p_agency, r.user_id, p_type, p_title, p_body, p_link);
  end loop;
end $$;

-- Changed columns between two rows, excluding bookkeeping columns. Used for audit "changes".
create or replace function private.row_diff(p_old jsonb, p_new jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', p_old -> n.key, 'to', n.value)), '{}'::jsonb)
  from jsonb_each(p_new) n
  where n.key not in ('updated_at', 'updated_by', 'created_at', 'phone_normalized', 'accepted_snapshot',
                      'quotation_snapshot', 'idempotency_key', 'subtotal', 'tax_amount', 'discount_amount')
    and (p_old -> n.key) is distinct from n.value
$$;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function private.tg_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and to_jsonb(new) ? 'updated_by' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid()));
  end if;
  return new;
end $$;

-- Sets tenant/ownership columns from the session on insert so clients cannot forge them.
create or replace function private.tg_set_tenant()
returns trigger language plpgsql as $$
declare v_agency uuid := private.current_agency_id();
begin
  if auth.uid() is not null then
    if v_agency is null then
      perform private.fail('You are not an active member of an agency workspace.', '42501');
    end if;
    new.agency_id := v_agency;
  elsif new.agency_id is null then
    perform private.fail('agency_id is required for service operations.');
  end if;
  return new;
end $$;

create or replace function private.tg_set_created_by()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + (for self sign-up) a new agency with the user as owner.
-- Invited users are attached to an agency by the server using the service role.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid;
  v_name text := nullif(trim(new.raw_user_meta_data ->> 'agency_name'), '');
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''), new.email)
  on conflict (id) do nothing;

  if v_name is not null and coalesce(new.raw_app_meta_data ->> 'invited', 'false') <> 'true' then
    insert into public.agencies (name, email, currency)
    values (left(v_name, 120), new.email,
            coalesce(nullif(upper(new.raw_user_meta_data ->> 'currency'), ''), 'INR'))
    returning id into v_agency;
    insert into public.agency_members (agency_id, user_id, role, status) values (v_agency, new.id, 'owner', 'active');
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Agency members: role management rules
-- ---------------------------------------------------------------------------
create or replace function private.tg_members_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role public.member_role := private.current_member_role();
begin
  if auth.uid() is null then
    return coalesce(new, old); -- service role / migrations
  end if;
  if tg_op = 'UPDATE' then
    if new.agency_id <> old.agency_id or new.user_id <> old.user_id then
      perform private.fail('Membership agency and user cannot be changed.', '42501');
    end if;
    if old.user_id = auth.uid() and (new.role <> old.role or new.status <> old.status) then
      perform private.fail('You cannot change your own role or status.', '42501');
    end if;
    if v_role = 'admin' and (old.role <> 'agent' or new.role <> 'agent') then
      perform private.fail('Administrators can only manage travel agents.', '42501');
    end if;
    if v_role not in ('owner', 'admin') then
      perform private.fail('You do not have permission to manage team members.', '42501');
    end if;
    if old.role = 'owner' and (new.role <> 'owner' or new.status <> 'active') and
       (select count(*) from public.agency_members
        where agency_id = old.agency_id and role = 'owner' and status = 'active' and id <> old.id) = 0 then
      perform private.fail('An agency must keep at least one active owner.');
    end if;
    new.updated_at := now();
    perform private.log_activity(new.agency_id, 'member', new.user_id, null, 'member.updated',
      'Team member access updated', old.role::text || '/' || old.status::text, new.role::text || '/' || new.status::text);
    return new;
  end if;
  perform private.fail('Team members are added through the invitation flow.', '42501');
  return null;
end $$;

create trigger agency_members_guard before update or insert or delete on public.agency_members
  for each row execute function private.tg_members_guard();

create trigger agencies_touch before update on public.agencies for each row execute function private.tg_touch();
create trigger profiles_touch before update on public.profiles for each row execute function private.tg_touch();

create or replace function private.tg_agency_audit()
returns trigger language plpgsql as $$
begin
  perform private.log_activity(new.id, 'agency', new.id, new.name, 'agency.updated', 'Agency settings updated',
    null, null, private.row_diff(to_jsonb(old), to_jsonb(new)));
  return new;
end $$;
create trigger agencies_audit after update on public.agencies for each row execute function private.tg_agency_audit();

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create or replace function private.normalize_phone(p text)
returns text language sql immutable as $$
  select case when left(trim(p), 1) = '+' then '+' else '' end || regexp_replace(p, '[^0-9]', '', 'g')
$$;

create or replace function private.tg_customers_before()
returns trigger language plpgsql as $$
begin
  new.phone_normalized := private.normalize_phone(new.phone);
  new.email := nullif(trim(new.email::text), '');
  if tg_op = 'INSERT' then
    new.customer_code := private.next_code(new.agency_id, 'customer', 'CUS');
    if auth.uid() is not null and private.current_member_role() = 'agent' then
      new.assigned_to := auth.uid();
    end if;
    new.archived_at := null;
  else
    new.customer_code := old.customer_code;
    new.agency_id := old.agency_id;
    new.created_by := old.created_by;
    if auth.uid() is not null and not private.is_manager() then
      if new.assigned_to is distinct from old.assigned_to then
        perform private.fail('Only owners and administrators can reassign customers.', '42501');
      end if;
      if new.archived_at is distinct from old.archived_at then
        perform private.fail('Only owners and administrators can archive customers.', '42501');
      end if;
    end if;
    if old.archived_at is not null and new.archived_at is not null then
      perform private.fail('Archived customers cannot be edited. Restore the customer first.');
    end if;
    if new.archived_at is not null and old.archived_at is null then
      new.archived_by := auth.uid();
    elsif new.archived_at is null then
      new.archived_by := null;
    end if;
  end if;
  if new.assigned_to is not null and not private.is_active_member_of(new.agency_id, new.assigned_to) then
    perform private.fail('The assigned employee is not an active member of this agency.');
  end if;
  return new;
end $$;

create trigger aa_customers_tenant before insert on public.customers for each row execute function private.tg_set_tenant();
create trigger ab_customers_created_by before insert on public.customers for each row execute function private.tg_set_created_by();
create trigger customers_before before insert or update on public.customers for each row execute function private.tg_customers_before();
create trigger customers_touch before update on public.customers for each row execute function private.tg_touch();

create or replace function private.tg_customers_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, 'customer', new.id, new.customer_code, 'customer.created',
      'Customer ' || new.full_name || ' created');
  elsif new.archived_at is not null and old.archived_at is null then
    perform private.log_activity(new.agency_id, 'customer', new.id, new.customer_code, 'customer.archived', 'Customer archived');
  elsif new.archived_at is null and old.archived_at is not null then
    perform private.log_activity(new.agency_id, 'customer', new.id, new.customer_code, 'customer.restored', 'Customer restored');
  else
    perform private.log_activity(new.agency_id, 'customer', new.id, new.customer_code, 'customer.updated',
      'Customer details updated', null, null, private.row_diff(to_jsonb(old), to_jsonb(new)));
  end if;
  return new;
end $$;
create trigger customers_audit after insert or update on public.customers for each row execute function private.tg_customers_audit();

create or replace function private.tg_note_author()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  return new;
end $$;
create trigger aa_customer_notes_tenant before insert on public.customer_notes for each row execute function private.tg_set_tenant();
create trigger customer_notes_author before insert on public.customer_notes for each row execute function private.tg_note_author();
create trigger aa_enquiry_notes_tenant before insert on public.enquiry_notes for each row execute function private.tg_set_tenant();
create trigger enquiry_notes_author before insert on public.enquiry_notes for each row execute function private.tg_note_author();

-- ---------------------------------------------------------------------------
-- Enquiries: status machine (mirrors src/lib/domain/status.ts)
-- ---------------------------------------------------------------------------
create or replace function private.enquiry_transition_allowed(p_from public.enquiry_status, p_to public.enquiry_status)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'new' then p_to in ('contacted', 'requirements_pending', 'quotation_in_progress', 'lost', 'cancelled')
    when 'contacted' then p_to in ('requirements_pending', 'quotation_in_progress', 'lost', 'cancelled')
    when 'requirements_pending' then p_to in ('contacted', 'quotation_in_progress', 'lost', 'cancelled')
    when 'quotation_in_progress' then p_to in ('requirements_pending', 'quotation_sent', 'converted', 'lost', 'cancelled')
    when 'quotation_sent' then p_to in ('quotation_in_progress', 'converted', 'lost', 'cancelled')
    when 'lost' then p_to in ('contacted')
    else false
  end
$$;

create or replace function private.tg_enquiries_before()
returns trigger language plpgsql as $$
declare v_customer public.customers;
begin
  select * into v_customer from public.customers where id = new.customer_id;
  if v_customer.id is null or v_customer.agency_id <> new.agency_id then
    perform private.fail('Customer not found in this agency.', '23503');
  end if;

  if tg_op = 'INSERT' then
    if v_customer.archived_at is not null then
      perform private.fail('Cannot create an enquiry for an archived customer.');
    end if;
    new.enquiry_code := private.next_code(new.agency_id, 'enquiry', 'ENQ');
    new.status := 'new';
    if new.departure_date < current_date then
      perform private.fail('Departure date cannot be in the past.', '23514');
    end if;
    if auth.uid() is not null and private.current_member_role() = 'agent' then
      if new.assigned_to is not null and new.assigned_to <> auth.uid() then
        perform private.fail('Travel agents can only assign enquiries to themselves.', '42501');
      end if;
      new.assigned_to := auth.uid();
    end if;
  else
    new.enquiry_code := old.enquiry_code;
    new.agency_id := old.agency_id;
    new.created_by := old.created_by;
    new.idempotency_key := old.idempotency_key;
    if old.status in ('converted', 'cancelled') and new.status = old.status
       and (to_jsonb(new) - 'updated_at' - 'updated_by') <> (to_jsonb(old) - 'updated_at' - 'updated_by') then
      perform private.fail('Converted or cancelled enquiries are read-only.');
    end if;
    if not private.enquiry_transition_allowed(old.status, new.status) then
      perform private.fail(format('Enquiry status cannot change from %s to %s.', old.status, new.status), '23514');
    end if;
    if new.status = 'converted' and old.status <> 'converted'
       and coalesce(current_setting('travelx.system_transition', true), '') <> 'on' then
      perform private.fail('An enquiry becomes converted only when a booking is created from its accepted quotation.');
    end if;
    if new.customer_id <> old.customer_id and exists (select 1 from public.quotations where enquiry_id = old.id) then
      perform private.fail('The customer cannot be changed after quotations exist for this enquiry.');
    end if;
    if new.assigned_to is distinct from old.assigned_to and auth.uid() is not null and not private.is_manager() then
      perform private.fail('Only owners and administrators can reassign enquiries.', '42501');
    end if;
  end if;
  if new.assigned_to is not null and not private.is_active_member_of(new.agency_id, new.assigned_to) then
    perform private.fail('The assigned employee is not an active member of this agency.');
  end if;
  return new;
end $$;

create trigger aa_enquiries_tenant before insert on public.enquiries for each row execute function private.tg_set_tenant();
create trigger ab_enquiries_created_by before insert on public.enquiries for each row execute function private.tg_set_created_by();
create trigger enquiries_before before insert or update on public.enquiries for each row execute function private.tg_enquiries_before();
create trigger enquiries_touch before update on public.enquiries for each row execute function private.tg_touch();

create or replace function private.tg_enquiries_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_link text := '/enquiries/' || new.id;
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, 'enquiry', new.id, new.enquiry_code, 'enquiry.created',
      'Enquiry created for ' || new.destination, null, new.status::text);
    perform private.notify_managers(new.agency_id, 'enquiry.created', 'New enquiry ' || new.enquiry_code,
      new.destination || ', departing ' || to_char(new.departure_date, 'DD Mon YYYY'), v_link, auth.uid());
    if new.assigned_to is not null then
      perform private.notify(new.agency_id, new.assigned_to, 'enquiry.assigned', 'Enquiry ' || new.enquiry_code || ' assigned to you',
        new.destination, v_link);
    end if;
    return new;
  end if;

  if new.status <> old.status then
    perform private.log_activity(new.agency_id, 'enquiry', new.id, new.enquiry_code, 'enquiry.status_changed',
      'Status changed', old.status::text, new.status::text,
      case when new.status_reason is not null then jsonb_build_object('reason', new.status_reason) end);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    perform private.log_activity(new.agency_id, 'enquiry', new.id, new.enquiry_code, 'enquiry.assigned',
      'Enquiry reassigned', null, null, jsonb_build_object('assigned_to', jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to)));
    perform private.notify(new.agency_id, new.assigned_to, 'enquiry.assigned', 'Enquiry ' || new.enquiry_code || ' assigned to you',
      new.destination, v_link);
  end if;
  declare v_diff jsonb := private.row_diff(to_jsonb(old), to_jsonb(new)) - 'status' - 'assigned_to' - 'status_reason';
  begin
    if v_diff <> '{}'::jsonb then
      perform private.log_activity(new.agency_id, 'enquiry', new.id, new.enquiry_code, 'enquiry.updated',
        'Enquiry details updated', null, null, v_diff);
    end if;
  end;
  return new;
end $$;
create trigger enquiries_after after insert or update on public.enquiries for each row execute function private.tg_enquiries_after();

-- System-driven enquiry transitions (quotation created/sent, booking created).
create or replace function private.advance_enquiry(p_enquiry uuid, p_to public.enquiry_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.enquiry_status;
begin
  select status into v_status from public.enquiries where id = p_enquiry for update;
  if v_status is null or v_status = p_to then return; end if;
  if private.enquiry_transition_allowed(v_status, p_to) then
    perform set_config('travelx.system_transition', 'on', true);
    update public.enquiries set status = p_to where id = p_enquiry;
    perform set_config('travelx.system_transition', 'off', true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------
create or replace function private.quotation_transition_allowed(p_from public.quotation_status, p_to public.quotation_status)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'draft' then p_to in ('reviewed')
    when 'reviewed' then p_to in ('draft', 'sent')
    when 'sent' then p_to in ('accepted', 'rejected', 'expired')
    else false
  end
$$;

-- Authoritative total computation. Discounts apply to the pre-tax subtotal.
create or replace function private.quotation_compute_totals(q public.quotations)
returns public.quotations language plpgsql stable as $$
declare
  v_sub numeric(14,2);
  v_tax numeric(14,2);
  v_disc numeric(14,2);
begin
  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_tax), 0)
    into v_sub, v_tax from public.quotation_items where quotation_id = q.id;
  v_disc := case q.discount_type
    when 'fixed' then q.discount_value
    when 'percent' then round(v_sub * q.discount_value / 100, 2)
    else 0 end;
  if v_disc > v_sub then
    perform private.fail('Discount cannot exceed the quotation subtotal.', '23514');
  end if;
  q.subtotal := v_sub;
  q.tax_amount := v_tax;
  q.discount_amount := v_disc;
  q.grand_total := v_sub + v_tax - v_disc;
  return q;
end $$;

create or replace function private.tg_quotations_before()
returns trigger language plpgsql as $$
declare
  v_enquiry public.enquiries;
  v_agency public.agencies;
  v_locked_changes jsonb;
begin
  select * into v_agency from public.agencies where id = new.agency_id;

  if tg_op = 'INSERT' then
    select * into v_enquiry from public.enquiries where id = new.enquiry_id;
    if v_enquiry.id is null or v_enquiry.agency_id <> new.agency_id then
      perform private.fail('Enquiry not found in this agency.', '23503');
    end if;
    if v_enquiry.status in ('converted', 'lost', 'cancelled') then
      perform private.fail('Quotations cannot be created for converted, lost or cancelled enquiries.');
    end if;
    new.customer_id := v_enquiry.customer_id;
    new.currency := v_enquiry.currency;
    new.quotation_code := private.next_code(new.agency_id, 'quotation', 'QUO');
    new.status := 'draft';
    new.reviewed_at := null; new.reviewed_by := null; new.sent_at := null; new.accepted_at := null;
    new.rejected_at := null; new.expired_at := null; new.accepted_snapshot := null;
    new.subtotal := 0; new.tax_amount := 0; new.grand_total := 0;
    -- Discounts are applied after line items exist (an update recomputes totals).
    new.discount_type := 'none'; new.discount_value := 0; new.discount_amount := 0;
    if new.terms is null then new.terms := v_agency.quotation_terms; end if;
    if new.payment_terms is null then new.payment_terms := v_agency.payment_terms; end if;
    return new;
  end if;

  -- UPDATE
  new.quotation_code := old.quotation_code;
  new.agency_id := old.agency_id;
  new.enquiry_id := old.enquiry_id;
  new.customer_id := old.customer_id;
  new.currency := old.currency;
  new.created_by := old.created_by;
  new.duplicated_from := old.duplicated_from;

  if old.status <> 'draft' then
    v_locked_changes := private.row_diff(to_jsonb(old), to_jsonb(new))
      - 'status' - 'reviewed_at' - 'reviewed_by' - 'sent_at' - 'accepted_at' - 'rejected_at' - 'expired_at'
      - 'rejection_reason' - 'grand_total' - 'internal_notes';
    if v_locked_changes <> '{}'::jsonb then
      perform private.fail('Only draft quotations can be edited. Move it back to draft or duplicate it.');
    end if;
  end if;

  if not private.quotation_transition_allowed(old.status, new.status) then
    perform private.fail(format('Quotation status cannot change from %s to %s.', old.status, new.status), '23514');
  end if;

  if new.discount_type = 'none' then new.discount_value := 0; end if;
  new := private.quotation_compute_totals(new);

  -- Discount approval limit for travel agents.
  if auth.uid() is not null and private.current_member_role() = 'agent'
     and (new.discount_type, new.discount_value) is distinct from (old.discount_type, old.discount_value)
     and new.discount_amount > round(new.subtotal * v_agency.max_agent_discount_percent / 100, 2) then
    perform private.fail(format('Travel agents can apply discounts up to %s%% of the subtotal. Ask an administrator to approve a larger discount.',
      v_agency.max_agent_discount_percent), '42501');
  end if;

  if new.status <> old.status then
    case new.status
      when 'reviewed' then
        if auth.uid() is not null and not private.is_manager() then
          perform private.fail('Only owners and administrators can mark a quotation as reviewed.', '42501');
        end if;
        if not exists (select 1 from public.quotation_items where quotation_id = new.id) or new.grand_total <= 0 then
          perform private.fail('A quotation needs at least one priced line item before review.');
        end if;
        new.reviewed_at := now(); new.reviewed_by := auth.uid();
      when 'draft' then
        new.reviewed_at := null; new.reviewed_by := null;
      when 'sent' then
        if new.valid_until < current_date then
          perform private.fail('The validity date has passed. Update it before sending.');
        end if;
        new.sent_at := now();
      when 'accepted' then
        if new.valid_until < current_date then
          perform private.fail('This quotation has expired and cannot be accepted. Duplicate it to issue a new one.');
        end if;
        new.accepted_at := now();
        new.accepted_snapshot := jsonb_build_object(
          'quotation', to_jsonb(new) - 'accepted_snapshot',
          'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.position, i.created_at), '[]'::jsonb)
                    from public.quotation_items i where i.quotation_id = new.id),
          'captured_at', now());
      when 'rejected' then
        new.rejected_at := now();
      when 'expired' then
        new.expired_at := now();
      else null;
    end case;
  end if;
  return new;
end $$;

create trigger aa_quotations_tenant before insert on public.quotations for each row execute function private.tg_set_tenant();
create trigger ab_quotations_created_by before insert on public.quotations for each row execute function private.tg_set_created_by();
create trigger quotations_before before insert or update on public.quotations for each row execute function private.tg_quotations_before();
create trigger quotations_touch before update on public.quotations for each row execute function private.tg_touch();

create or replace function private.tg_quotations_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_link text := '/quotations/' || new.id;
  v_enquiry public.enquiries;
begin
  select * into v_enquiry from public.enquiries where id = new.enquiry_id;
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, 'quotation', new.id, new.quotation_code, 'quotation.created',
      'Quotation created', null, 'draft', null, new.enquiry_id);
    perform private.advance_enquiry(new.enquiry_id, 'quotation_in_progress');
    return new;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.status <> old.status then
    perform private.log_activity(new.agency_id, 'quotation', new.id, new.quotation_code, 'quotation.status_changed',
      'Quotation marked ' || replace(new.status::text, '_', ' '), old.status::text, new.status::text,
      case when new.rejection_reason is not null and new.status = 'rejected' then jsonb_build_object('reason', new.rejection_reason) end,
      new.enquiry_id);
    if new.status = 'reviewed' then
      perform private.notify(new.agency_id, new.created_by, 'quotation.reviewed', 'Quotation ' || new.quotation_code || ' reviewed',
        'Ready to send to the customer.', v_link);
      perform private.notify(new.agency_id, v_enquiry.assigned_to, 'quotation.reviewed', 'Quotation ' || new.quotation_code || ' reviewed',
        'Ready to send to the customer.', v_link);
    elsif new.status = 'sent' then
      perform private.advance_enquiry(new.enquiry_id, 'quotation_sent');
    elsif new.status = 'accepted' then
      perform private.notify_managers(new.agency_id, 'quotation.accepted', 'Quotation ' || new.quotation_code || ' accepted',
        'Convert it into a booking.', v_link, auth.uid());
      perform private.notify(new.agency_id, v_enquiry.assigned_to, 'quotation.accepted', 'Quotation ' || new.quotation_code || ' accepted',
        'Convert it into a booking.', v_link);
    end if;
  elsif new.status = 'draft' then
    declare v_diff jsonb := private.row_diff(to_jsonb(old), to_jsonb(new)) - 'grand_total';
    begin
      if v_diff <> '{}'::jsonb then
        perform private.log_activity(new.agency_id, 'quotation', new.id, new.quotation_code, 'quotation.updated',
          'Quotation updated', null, null, v_diff, new.enquiry_id);
      end if;
    end;
  end if;
  return new;
end $$;
create trigger quotations_after after insert or update on public.quotations for each row execute function private.tg_quotations_after();

create or replace function private.tg_quotations_delete_guard()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    perform private.fail('Only draft quotations can be deleted.');
  end if;
  return old;
end $$;
create trigger quotations_delete_guard before delete on public.quotations for each row execute function private.tg_quotations_delete_guard();

-- Items: only editable while the parent is a draft; every change recomputes the parent totals.
create or replace function private.tg_quotation_items_before()
returns trigger language plpgsql as $$
declare v_q public.quotations;
begin
  select * into v_q from public.quotations where id = coalesce(new.quotation_id, old.quotation_id);
  if v_q.id is null then
    if tg_op = 'DELETE' then return old; end if; -- parent draft is being deleted (FK cascade)
    perform private.fail('Quotation not found.', '23503');
  end if;
  if v_q.status <> 'draft' then
    perform private.fail('Line items can only be changed while the quotation is a draft.');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and new.quotation_id <> old.quotation_id then
    perform private.fail('Line items cannot be moved between quotations.');
  end if;
  new.agency_id := v_q.agency_id;
  return new;
end $$;

create or replace function private.tg_quotation_items_after()
returns trigger language plpgsql as $$
begin
  -- Touching the parent re-runs private.quotation_compute_totals in its BEFORE UPDATE trigger.
  update public.quotations set updated_at = now()
  where id = coalesce(new.quotation_id, old.quotation_id) and status = 'draft';
  return null;
end $$;

create trigger quotation_items_before before insert or update or delete on public.quotation_items
  for each row execute function private.tg_quotation_items_before();
create trigger quotation_items_after after insert or update or delete on public.quotation_items
  for each row execute function private.tg_quotation_items_after();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create or replace function private.booking_transition_allowed(p_from public.booking_status, p_to public.booking_status)
returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'pending_confirmation' then p_to in ('confirmed', 'cancelled')
    when 'confirmed' then p_to in ('in_progress', 'cancelled')
    when 'in_progress' then p_to in ('completed', 'cancelled')
    else false
  end
$$;

create or replace function private.tg_bookings_before()
returns trigger language plpgsql as $$
declare
  v_q public.quotations;
  v_e public.enquiries;
begin
  if tg_op = 'INSERT' then
    select * into v_q from public.quotations where id = new.quotation_id for update;
    if v_q.id is null or v_q.agency_id <> new.agency_id then
      perform private.fail('Quotation not found in this agency.', '23503');
    end if;
    if v_q.status <> 'accepted' then
      perform private.fail('Only accepted quotations can be converted into bookings.');
    end if;
    select * into v_e from public.enquiries where id = v_q.enquiry_id;
    -- Everything financial and contractual is copied from the accepted quotation snapshot.
    new.booking_code := private.next_code(new.agency_id, 'booking', 'BKG');
    new.customer_id := v_q.customer_id;
    new.enquiry_id := v_q.enquiry_id;
    new.destination := v_e.destination;
    new.departure_date := coalesce(new.departure_date, v_e.departure_date);
    new.return_date := coalesce(new.return_date, v_e.return_date);
    new.total_amount := (v_q.accepted_snapshot -> 'quotation' ->> 'grand_total')::numeric;
    new.currency := v_q.currency;
    new.quotation_snapshot := v_q.accepted_snapshot;
    new.status := 'pending_confirmation';
    new.assigned_to := coalesce(v_e.assigned_to, auth.uid());
    new.confirmed_at := null; new.completed_at := null; new.cancelled_at := null; new.cancelled_by := null;
    new.cancellation_reason := null;
    return new;
  end if;

  new.booking_code := old.booking_code;
  new.agency_id := old.agency_id;
  new.customer_id := old.customer_id;
  new.enquiry_id := old.enquiry_id;
  new.quotation_id := old.quotation_id;
  new.total_amount := old.total_amount;
  new.currency := old.currency;
  new.quotation_snapshot := old.quotation_snapshot;
  new.created_by := old.created_by;
  new.destination := old.destination;

  if old.status in ('completed', 'cancelled')
     and (to_jsonb(new) - 'updated_at' - 'updated_by' - 'notes') <> (to_jsonb(old) - 'updated_at' - 'updated_by' - 'notes') then
    perform private.fail('Completed or cancelled bookings cannot be changed.');
  end if;
  if not private.booking_transition_allowed(old.status, new.status) then
    perform private.fail(format('Booking status cannot change from %s to %s.', replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')), '23514');
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    if auth.uid() is not null and not private.is_manager() then
      perform private.fail('Only owners and administrators can reassign bookings.', '42501');
    end if;
    if new.assigned_to is not null and not private.is_active_member_of(new.agency_id, new.assigned_to) then
      perform private.fail('The assigned employee is not an active member of this agency.');
    end if;
  end if;
  if (new.departure_date, new.return_date) is distinct from (old.departure_date, old.return_date) and old.status <> 'pending_confirmation'
     and auth.uid() is not null and not private.is_manager() then
    perform private.fail('Only owners and administrators can change travel dates after confirmation.', '42501');
  end if;
  if new.status <> old.status then
    case new.status
      when 'confirmed' then new.confirmed_at := now();
      when 'completed' then
        if new.return_date > current_date then
          perform private.fail('A booking can be completed only after the return date.');
        end if;
        new.completed_at := now();
      when 'in_progress' then
        if new.departure_date > current_date then
          perform private.fail('A booking can be marked in progress only on or after the departure date.');
        end if;
      when 'cancelled' then
        if auth.uid() is not null and not private.is_manager() then
          perform private.fail('Only owners and administrators can cancel bookings.', '42501');
        end if;
        if new.cancellation_reason is null or char_length(trim(new.cancellation_reason)) < 3 then
          perform private.fail('A cancellation reason is required.');
        end if;
        new.cancelled_at := now(); new.cancelled_by := auth.uid();
      else null;
    end case;
  end if;
  return new;
end $$;

create trigger aa_bookings_tenant before insert on public.bookings for each row execute function private.tg_set_tenant();
create trigger ab_bookings_created_by before insert on public.bookings for each row execute function private.tg_set_created_by();
create trigger bookings_before before insert or update on public.bookings for each row execute function private.tg_bookings_before();
create trigger bookings_touch before update on public.bookings for each row execute function private.tg_touch();

create or replace function private.tg_bookings_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_link text := '/bookings/' || new.id;
begin
  if tg_op = 'INSERT' then
    perform private.advance_enquiry(new.enquiry_id, 'converted');
    update public.itineraries set booking_id = new.id where quotation_id = new.quotation_id and booking_id is null;
    perform private.log_activity(new.agency_id, 'booking', new.id, new.booking_code, 'booking.created',
      'Booking created from an accepted quotation', null, new.status::text,
      jsonb_build_object('total_amount', new.total_amount, 'currency', new.currency));
    perform private.notify_managers(new.agency_id, 'booking.created', 'Booking ' || new.booking_code || ' created',
      new.destination, v_link, auth.uid());
    return new;
  end if;
  if new.status <> old.status then
    perform private.log_activity(new.agency_id, 'booking', new.id, new.booking_code, 'booking.status_changed',
      'Booking marked ' || replace(new.status::text, '_', ' '), old.status::text, new.status::text,
      case when new.status = 'cancelled' then jsonb_build_object('reason', new.cancellation_reason) end);
    if new.status in ('confirmed', 'cancelled') then
      perform private.notify_managers(new.agency_id, 'booking.' || new.status, 'Booking ' || new.booking_code || ' ' || new.status::text,
        new.destination, v_link, auth.uid());
      perform private.notify(new.agency_id, new.assigned_to, 'booking.' || new.status, 'Booking ' || new.booking_code || ' ' || new.status::text,
        new.destination, v_link);
    end if;
  else
    declare v_diff jsonb := private.row_diff(to_jsonb(old), to_jsonb(new));
    begin
      if v_diff <> '{}'::jsonb then
        perform private.log_activity(new.agency_id, 'booking', new.id, new.booking_code, 'booking.updated',
          'Booking details updated', null, null, v_diff);
      end if;
    end;
  end if;
  return new;
end $$;
create trigger bookings_after after insert or update on public.bookings for each row execute function private.tg_bookings_after();

create or replace function private.tg_booking_child_before()
returns trigger language plpgsql as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = coalesce(new.booking_id, old.booking_id);
  if v_b.id is null then perform private.fail('Booking not found.', '23503'); end if;
  if v_b.status in ('completed', 'cancelled') then
    perform private.fail('Travellers cannot be changed on completed or cancelled bookings.');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.agency_id := v_b.agency_id;
  return new;
end $$;
create trigger booking_travellers_before before insert or update or delete on public.booking_travellers
  for each row execute function private.tg_booking_child_before();

-- Converts an accepted quotation into a booking atomically. SECURITY INVOKER: RLS applies.
create or replace function public.convert_quotation_to_booking(p_quotation_id uuid, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.bookings where quotation_id = p_quotation_id;
  if v_id is not null then
    perform private.fail('This quotation has already been converted into a booking.', '23505');
  end if;
  insert into public.bookings (quotation_id, notes, customer_id, enquiry_id, destination, departure_date, return_date,
                               total_amount, currency, quotation_snapshot)
  select q.id, p_notes, q.customer_id, q.enquiry_id, '', null, null, 0, q.currency, '{}'::jsonb
  from public.quotations q where q.id = p_quotation_id
  returning id into v_id;
  if v_id is null then
    perform private.fail('Quotation not found.', '23503');
  end if;
  return v_id;
end $$;

-- Duplicates a quotation (header + items) as a new draft. SECURITY INVOKER: RLS applies.
create or replace function public.duplicate_quotation(p_quotation_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_src public.quotations;
  v_new uuid;
  v_days integer;
begin
  select * into v_src from public.quotations where id = p_quotation_id;
  if v_src.id is null then perform private.fail('Quotation not found.', '23503'); end if;
  select quotation_validity_days into v_days from public.agencies where id = v_src.agency_id;
  insert into public.quotations (enquiry_id, title, issue_date, valid_until, terms, payment_terms, internal_notes, duplicated_from)
  values (v_src.enquiry_id, left(v_src.title || ' (copy)', 160), current_date, current_date + coalesce(v_days, 14),
          v_src.terms, v_src.payment_terms, v_src.internal_notes, v_src.id)
  returning id into v_new;
  insert into public.quotation_items (quotation_id, position, category, description, quantity, unit_price, tax_rate)
  select v_new, position, category, description, quantity, unit_price, tax_rate
  from public.quotation_items where quotation_id = v_src.id;
  if v_src.discount_type <> 'none' then
    update public.quotations set discount_type = v_src.discount_type, discount_value = v_src.discount_value where id = v_new;
  end if;
  return v_new;
end $$;

-- Replaces all line items of a draft quotation in one transaction. Client totals are never accepted:
-- only quantity, unit price and tax rate are stored; totals are generated columns.
create or replace function public.save_quotation_items(p_quotation_id uuid, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    perform private.fail('Invalid line items payload.');
  end if;
  if not exists (select 1 from public.quotations where id = p_quotation_id) then
    perform private.fail('Quotation not found.', '23503');
  end if;
  delete from public.quotation_items where quotation_id = p_quotation_id;
  insert into public.quotation_items (quotation_id, position, category, description, quantity, unit_price, tax_rate)
  select p_quotation_id, (x.ord - 1)::int, (x.item ->> 'category')::public.quotation_item_category,
         trim(x.item ->> 'description'), (x.item ->> 'quantity')::numeric, (x.item ->> 'unit_price')::numeric,
         coalesce((x.item ->> 'tax_rate')::numeric, 0)
  from jsonb_array_elements(p_items) with ordinality as x(item, ord);
end $$;

-- ---------------------------------------------------------------------------
-- Itineraries
-- ---------------------------------------------------------------------------
create or replace function private.tg_itineraries_before()
returns trigger language plpgsql as $$
begin
  if new.enquiry_id is not null and not exists (select 1 from public.enquiries where id = new.enquiry_id and agency_id = new.agency_id) then
    perform private.fail('Enquiry not found in this agency.', '23503');
  end if;
  if new.quotation_id is not null and not exists (select 1 from public.quotations where id = new.quotation_id and agency_id = new.agency_id) then
    perform private.fail('Quotation not found in this agency.', '23503');
  end if;
  if new.booking_id is not null and not exists (select 1 from public.bookings where id = new.booking_id and agency_id = new.agency_id) then
    perform private.fail('Booking not found in this agency.', '23503');
  end if;
  if tg_op = 'UPDATE' then
    new.agency_id := old.agency_id;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger aa_itineraries_tenant before insert on public.itineraries for each row execute function private.tg_set_tenant();
create trigger ab_itineraries_created_by before insert on public.itineraries for each row execute function private.tg_set_created_by();
create trigger itineraries_before before insert or update on public.itineraries for each row execute function private.tg_itineraries_before();
create trigger itineraries_touch before update on public.itineraries for each row execute function private.tg_touch();

create or replace function private.tg_itineraries_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, 'itinerary', new.id, new.name, 'itinerary.created', 'Itinerary created',
      null, null, null, coalesce(new.booking_id, new.enquiry_id));
  end if;
  return new;
end $$;
create trigger itineraries_audit after insert on public.itineraries for each row execute function private.tg_itineraries_audit();

create or replace function private.tg_itinerary_day_before()
returns trigger language plpgsql as $$
declare v_i public.itineraries;
begin
  select * into v_i from public.itineraries where id = new.itinerary_id;
  if v_i.id is null then perform private.fail('Itinerary not found.', '23503'); end if;
  new.agency_id := v_i.agency_id;
  if new.day_number > (v_i.end_date - v_i.start_date) + 1 then
    perform private.fail('Day number is outside the itinerary travel dates.', '23514');
  end if;
  new.day_date := v_i.start_date + (new.day_number - 1);
  return new;
end $$;
create trigger itinerary_days_before before insert or update on public.itinerary_days for each row execute function private.tg_itinerary_day_before();

create or replace function private.tg_itinerary_activity_before()
returns trigger language plpgsql as $$
declare v_agency uuid;
begin
  select agency_id into v_agency from public.itinerary_days where id = new.day_id;
  if v_agency is null then perform private.fail('Itinerary day not found.', '23503'); end if;
  new.agency_id := v_agency;
  return new;
end $$;
create trigger itinerary_activities_before before insert or update on public.itinerary_activities
  for each row execute function private.tg_itinerary_activity_before();

-- Swap an activity with its neighbour inside a day (reorder). SECURITY INVOKER.
create or replace function public.move_itinerary_activity(p_activity_id uuid, p_direction text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_a public.itinerary_activities;
  v_b public.itinerary_activities;
begin
  select * into v_a from public.itinerary_activities where id = p_activity_id for update;
  if v_a.id is null then perform private.fail('Activity not found.', '23503'); end if;
  -- normalise positions first so swaps are well defined
  update public.itinerary_activities t set position = s.rn
  from (select id, (row_number() over (order by position, created_at))::int - 1 as rn
        from public.itinerary_activities where day_id = v_a.day_id) s
  where t.id = s.id and t.position <> s.rn;
  select * into v_a from public.itinerary_activities where id = p_activity_id;
  if p_direction = 'up' then
    select * into v_b from public.itinerary_activities where day_id = v_a.day_id and position = v_a.position - 1;
  elsif p_direction = 'down' then
    select * into v_b from public.itinerary_activities where day_id = v_a.day_id and position = v_a.position + 1;
  else
    perform private.fail('Direction must be up or down.');
  end if;
  if v_b.id is null then return; end if;
  update public.itinerary_activities set position = v_b.position where id = v_a.id;
  update public.itinerary_activities set position = v_a.position where id = v_b.id;
end $$;

-- ---------------------------------------------------------------------------
-- Payments and refunds
-- ---------------------------------------------------------------------------
-- Net collected for a booking = received amounts (incl. partially/fully refunded payments) minus refunds.
create or replace function private.booking_net_collected(p_booking uuid, p_exclude_payment uuid default null)
returns numeric language sql stable as $$
  select coalesce(sum(p.amount - p.refunded_amount), 0)::numeric(14,2)
  from public.payments p
  where p.booking_id = p_booking and p.status in ('received', 'partially_refunded', 'refunded')
    and p.id is distinct from p_exclude_payment
$$;

create or replace function private.tg_payments_before()
returns trigger language plpgsql as $$
declare
  v_b public.bookings;
  v_refund_ctx boolean := coalesce(current_setting('travelx.refund_context', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    select * into v_b from public.bookings where id = new.booking_id for update;
    if v_b.id is null or v_b.agency_id <> new.agency_id then
      perform private.fail('Booking not found in this agency.', '23503');
    end if;
    if v_b.status = 'cancelled' then
      perform private.fail('Payments cannot be recorded against a cancelled booking.');
    end if;
    if new.status not in ('pending', 'received') then
      perform private.fail('New payments must be recorded as pending or received.');
    end if;
    new.payment_code := private.next_code(new.agency_id, 'payment', 'PAY');
    new.customer_id := v_b.customer_id;
    new.currency := v_b.currency;
    new.refunded_amount := 0;
    new.transaction_reference := nullif(trim(new.transaction_reference), '');
    if auth.uid() is not null then new.recorded_by := auth.uid(); end if;
    if new.status = 'received' and private.booking_net_collected(v_b.id) + new.amount > v_b.total_amount then
      perform private.fail(format('Payment exceeds the outstanding balance of %s %s.', v_b.currency,
        to_char(v_b.total_amount - private.booking_net_collected(v_b.id), 'FM999999999990.00')), '23514');
    end if;
    return new;
  end if;

  -- UPDATE: financial records are append-only in spirit; only a narrow set of changes is allowed.
  new.payment_code := old.payment_code;
  new.agency_id := old.agency_id;
  new.booking_id := old.booking_id;
  new.customer_id := old.customer_id;
  new.currency := old.currency;
  new.recorded_by := old.recorded_by;
  new.idempotency_key := old.idempotency_key;
  if not v_refund_ctx then
    new.refunded_amount := old.refunded_amount;
  end if;

  if old.status <> 'pending' and (new.amount, new.method, new.payment_date, new.transaction_reference)
       is distinct from (old.amount, old.method, old.payment_date, old.transaction_reference) then
    perform private.fail('Only pending payments can be edited. Record a refund to reverse a received payment.');
  end if;

  if new.status <> old.status then
    if new.status in ('refunded', 'partially_refunded') and not v_refund_ctx then
      perform private.fail('Refund statuses are set automatically when a refund is recorded.');
    end if;
    if not (
      (old.status = 'pending' and new.status in ('received', 'failed')) or
      (v_refund_ctx and old.status in ('received', 'partially_refunded') and new.status in ('partially_refunded', 'refunded'))
    ) then
      perform private.fail(format('Payment status cannot change from %s to %s.', old.status, replace(new.status::text, '_', ' ')), '23514');
    end if;
    if new.status = 'received' then
      select * into v_b from public.bookings where id = new.booking_id for update;
      if v_b.status = 'cancelled' then
        perform private.fail('Payments cannot be received against a cancelled booking.');
      end if;
      if private.booking_net_collected(v_b.id, new.id) + new.amount > v_b.total_amount then
        perform private.fail('Payment exceeds the outstanding balance for this booking.', '23514');
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger aa_payments_tenant before insert on public.payments for each row execute function private.tg_set_tenant();
create trigger payments_before before insert or update on public.payments for each row execute function private.tg_payments_before();
create trigger payments_touch before update on public.payments for each row execute function private.tg_touch();

create or replace function private.tg_payments_no_delete()
returns trigger language plpgsql as $$
begin
  perform private.fail('Payment records cannot be deleted. Mark a pending payment as failed or record a refund.', '42501');
  return null;
end $$;
create trigger payments_no_delete before delete on public.payments for each row execute function private.tg_payments_no_delete();
create trigger payment_refunds_no_delete before delete or update on public.payment_refunds for each row execute function private.tg_payments_no_delete();

create or replace function private.tg_payments_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_booking_code text;
begin
  select booking_code into v_booking_code from public.bookings where id = new.booking_id;
  if tg_op = 'INSERT' then
    perform private.log_activity(new.agency_id, 'payment', new.id, new.payment_code, 'payment.recorded',
      format('Payment of %s %s recorded (%s)', new.currency, to_char(new.amount, 'FM999999999990.00'), new.status),
      null, new.status::text, jsonb_build_object('method', new.method, 'booking', v_booking_code), new.booking_id);
    if new.status = 'received' then
      perform private.notify_managers(new.agency_id, 'payment.recorded', 'Payment received for ' || v_booking_code,
        format('%s %s via %s', new.currency, to_char(new.amount, 'FM999999999990.00'), replace(new.method::text, '_', ' ')),
        '/payments/' || new.id, auth.uid());
    end if;
  elsif new.status <> old.status then
    perform private.log_activity(new.agency_id, 'payment', new.id, new.payment_code, 'payment.status_changed',
      'Payment marked ' || replace(new.status::text, '_', ' '), old.status::text, new.status::text, null, new.booking_id);
  end if;
  return new;
end $$;
create trigger payments_after after insert or update on public.payments for each row execute function private.tg_payments_after();

create or replace function private.tg_refunds_before()
returns trigger language plpgsql as $$
declare v_p public.payments;
begin
  if auth.uid() is not null and not private.is_owner() then
    perform private.fail('Only the agency owner can record refunds.', '42501');
  end if;
  select * into v_p from public.payments where id = new.payment_id for update;
  if v_p.id is null or v_p.agency_id <> new.agency_id then
    perform private.fail('Payment not found in this agency.', '23503');
  end if;
  if v_p.status not in ('received', 'partially_refunded') then
    perform private.fail('Only received payments can be refunded.');
  end if;
  if new.amount > v_p.amount - v_p.refunded_amount then
    perform private.fail(format('Refund exceeds the refundable amount of %s %s.', v_p.currency,
      to_char(v_p.amount - v_p.refunded_amount, 'FM999999999990.00')), '23514');
  end if;
  if new.refund_date < v_p.payment_date then
    perform private.fail('Refund date cannot be before the payment date.', '23514');
  end if;
  if auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  return new;
end $$;

create or replace function private.tg_refunds_after()
returns trigger language plpgsql as $$
declare v_p public.payments;
begin
  perform set_config('travelx.refund_context', 'on', true);
  update public.payments
     set refunded_amount = refunded_amount + new.amount,
         status = case when refunded_amount + new.amount >= amount then 'refunded'::public.payment_status
                       else 'partially_refunded'::public.payment_status end
   where id = new.payment_id
   returning * into v_p;
  perform set_config('travelx.refund_context', 'off', true);
  perform private.log_activity(new.agency_id, 'refund', new.id, v_p.payment_code, 'payment.refunded',
    format('Refund of %s %s recorded', v_p.currency, to_char(new.amount, 'FM999999999990.00')),
    null, v_p.status::text, jsonb_build_object('reason', new.reason), v_p.booking_id);
  return new;
end $$;

create trigger aa_payment_refunds_tenant before insert on public.payment_refunds for each row execute function private.tg_set_tenant();
create trigger payment_refunds_before before insert on public.payment_refunds for each row execute function private.tg_refunds_before();
create trigger payment_refunds_after after insert on public.payment_refunds for each row execute function private.tg_refunds_after();

-- ---------------------------------------------------------------------------
-- Notifications: users may only mark their own as read.
-- ---------------------------------------------------------------------------
create or replace function private.tg_notifications_guard()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'read_at') <> (to_jsonb(old) - 'read_at') then
    perform private.fail('Only the read state of a notification can change.', '42501');
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications for each row execute function private.tg_notifications_guard();

-- ---------------------------------------------------------------------------
-- Scheduled maintenance (called by /api/cron/daily with the service role)
-- ---------------------------------------------------------------------------
create or replace function public.run_daily_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expired integer;
  v_notified integer := 0;
  r record;
begin
  update public.quotations set status = 'expired'
  where status = 'sent' and valid_until < current_date;
  get diagnostics v_expired = row_count;

  for r in
    select b.* from public.bookings b
    where b.status in ('pending_confirmation', 'confirmed') and b.departure_date between current_date and current_date + 3
  loop
    insert into public.notifications (agency_id, user_id, type, title, body, link, dedupe_key)
    select r.agency_id, m.user_id, 'booking.upcoming', 'Trip ' || r.booking_code || ' departs ' || to_char(r.departure_date, 'DD Mon'),
           r.destination || case when r.status = 'pending_confirmation' then ' (still pending confirmation)' else '' end,
           '/bookings/' || r.id, 'upcoming:' || r.id || ':' || r.departure_date
    from public.agency_members m
    where m.agency_id = r.agency_id and m.status = 'active' and (m.role in ('owner', 'admin') or m.user_id = r.assigned_to)
    on conflict (user_id, dedupe_key) do nothing;
    v_notified := v_notified + 1;
  end loop;
  return jsonb_build_object('quotations_expired', v_expired, 'upcoming_bookings', v_notified);
end $$;
revoke all on function public.run_daily_maintenance() from public, anon, authenticated;
