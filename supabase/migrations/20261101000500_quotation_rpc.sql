-- Saves a quotation header, its line items and discount in ONE transaction, so a failure in any
-- part (invalid item, discount above the agent's limit) leaves nothing half-written.
-- SECURITY INVOKER: the caller's RLS policies and the quotation triggers apply.
create or replace function public.save_quotation(p_quotation_id uuid, p_header jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid := p_quotation_id;
begin
  if v_id is null then
    insert into public.quotations (enquiry_id, title, issue_date, valid_until, terms, payment_terms, internal_notes)
    values ((p_header ->> 'enquiry_id')::uuid, p_header ->> 'title', (p_header ->> 'issue_date')::date,
            (p_header ->> 'valid_until')::date, nullif(p_header ->> 'terms', ''), nullif(p_header ->> 'payment_terms', ''),
            nullif(p_header ->> 'internal_notes', ''))
    returning id into v_id;
  else
    update public.quotations
       set title = p_header ->> 'title',
           issue_date = (p_header ->> 'issue_date')::date,
           valid_until = (p_header ->> 'valid_until')::date,
           terms = nullif(p_header ->> 'terms', ''),
           payment_terms = nullif(p_header ->> 'payment_terms', ''),
           internal_notes = nullif(p_header ->> 'internal_notes', '')
     where id = v_id and status = 'draft';
    if not found then
      perform private.fail('Quotation not found, or it is no longer a draft.');
    end if;
  end if;

  perform public.save_quotation_items(v_id, p_items);

  update public.quotations
     set discount_type = coalesce(nullif(p_header ->> 'discount_type', ''), 'none')::public.discount_type,
         discount_value = coalesce(nullif(p_header ->> 'discount_value', '')::numeric, 0)
   where id = v_id;
  return v_id;
end $$;

revoke execute on function public.save_quotation(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quotation(uuid, jsonb, jsonb) to authenticated, service_role;
