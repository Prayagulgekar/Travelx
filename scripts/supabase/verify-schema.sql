-- TravelX: read-only schema check for a Supabase project after `supabase db push`.
-- Paste into the Supabase SQL editor (or run with psql). It only reads catalog tables; it changes nothing.
-- Every row should show ok = true.
with checks(check_name, expected, actual) as (
  select 'public tables', 18::bigint,
         (select count(*) from pg_tables where schemaname = 'public')
  union all
  select 'public tables with RLS enabled', 18,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity)
  union all
  select 'RLS policies in public', 39,
         (select count(*) from pg_policies where schemaname = 'public')
  union all
  select 'private tables (agency_counters, rate_limits)', 2,
         (select count(*) from pg_tables where schemaname = 'private')
  union all
  select 'trigger on_auth_user_created on auth.users', 1,
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created')
  union all
  select 'trigger on_auth_user_email_changed on auth.users', 1,
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_email_changed')
  union all
  select 'table privileges held by anon in public', 0,
         (select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public')
  union all
  select 'anon can execute public functions', 0,
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute'))
  union all
  select 'authenticated can execute run_daily_maintenance / rate_limit_hit', 0,
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('run_daily_maintenance', 'rate_limit_hit')
             and has_function_privilege('authenticated', p.oid, 'execute'))
  union all
  select 'authenticated can read private tables', 0,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'private' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, 'select'))
)
select check_name, expected, actual, expected = actual as ok from checks;
