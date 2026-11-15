-- Phase 6 remediation: keep privileged implementations outside the exposed API schema.
-- Public RPC wrappers remain SECURITY INVOKER and delegate only to tightly-scoped
-- SECURITY DEFINER implementations that validate auth.uid() internally.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Move the existing, already-reviewed implementations out of public. Their
-- function bodies, ownership checks, validation, and transactional behaviour
-- remain unchanged.
alter function public.confirm_rota_import(uuid, text, jsonb, date, date)
  set schema private;
alter function public.get_daily_motivation(date)
  set schema private;

-- The private implementations are callable only by authenticated sessions.
-- They are not exposed as PostgREST RPC endpoints because the private schema
-- is not part of the project's exposed API schemas.
revoke all on function private.confirm_rota_import(uuid, text, jsonb, date, date)
  from public, anon;
grant execute on function private.confirm_rota_import(uuid, text, jsonb, date, date)
  to authenticated;

revoke all on function private.get_daily_motivation(date)
  from public, anon;
grant execute on function private.get_daily_motivation(date)
  to authenticated;

-- Preserve the existing client-facing RPC names and argument signatures.
-- These wrappers execute as the caller; only the private implementation uses
-- SECURITY DEFINER, after validating auth.uid() and resource ownership.
create or replace function public.confirm_rota_import(
  p_rotation_id uuid,
  p_filename text,
  p_shifts jsonb,
  p_replace_start_date date,
  p_replace_end_date date
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.confirm_rota_import(
    p_rotation_id,
    p_filename,
    p_shifts,
    p_replace_start_date,
    p_replace_end_date
  );
$function$;

revoke all on function public.confirm_rota_import(uuid, text, jsonb, date, date)
  from public, anon;
grant execute on function public.confirm_rota_import(uuid, text, jsonb, date, date)
  to authenticated;

create or replace function public.get_daily_motivation(p_local_date date)
returns table(
  quote_id bigint,
  quote text,
  category text,
  motivation_date date,
  cached boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.get_daily_motivation(p_local_date);
$function$;

revoke all on function public.get_daily_motivation(date)
  from public, anon;
grant execute on function public.get_daily_motivation(date)
  to authenticated;

comment on schema private is
  'Internal application functions; not exposed through the Supabase Data API.';

commit;
