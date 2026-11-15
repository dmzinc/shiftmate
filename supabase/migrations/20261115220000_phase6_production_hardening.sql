-- Phase 6: production hardening
-- Restricts client access, hardens privileged RPCs, enforces tenant ownership
-- across related records, and adds indexes for foreign-key and RLS access paths.

begin;

-- The legacy AI-generation claim table is retained for compatibility, but is
-- intentionally unavailable to browser/mobile clients. Service-role functions
-- can continue to use it (service_role bypasses RLS).
revoke all on table public.motivation_generation_claims from anon, authenticated;
drop policy if exists "deny client access to motivation generation claims" on public.motivation_generation_claims;
create policy "deny client access to motivation generation claims"
  on public.motivation_generation_claims
  for all to anon, authenticated
  using (false) with check (false);

-- Security-definer is required by the curated quote RPC because the browser
-- must not receive write access to the history table. Keep its search path
-- empty and qualify every relation to prevent search_path object shadowing.
create or replace function public.get_daily_motivation(p_local_date date)
returns table(quote_id bigint, quote text, category text, motivation_date date, cached boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_existing record;
  v_category text;
  v_quote public.motivation_quotes%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select q.id as id, q.quote as quote, q.category as category, h.display_date as shown_on
    into v_existing
  from public.user_motivation_history as h
  join public.motivation_quotes as q on q.id = h.quote_id
  where h.user_id = v_user and h.display_date = p_local_date;

  if found then
    return query select v_existing.id, v_existing.quote, v_existing.category, v_existing.shown_on, true;
    return;
  end if;

  if exists (
    select 1 from public.shifts as s
    where s.user_id = v_user and s.archived = false and s.shift_date = p_local_date
  ) then
    v_category := 'confidence';
  elsif exists (
    select 1 from public.shifts as s
    where s.user_id = v_user and s.archived = false
      and s.shift_date > p_local_date and s.shift_date <= p_local_date + 1
  ) then
    v_category := 'encouragement';
  else
    v_category := 'growth';
  end if;

  select q.* into v_quote
  from public.motivation_quotes as q
  where q.active = true
    and q.category = v_category
    and not exists (
      select 1 from public.user_motivation_history as h
      where h.user_id = v_user and h.quote_id = q.id
    )
  order by random()
  limit 1;

  if not found then
    select q.* into v_quote
    from public.motivation_quotes as q
    where q.active = true
      and not exists (
        select 1 from public.user_motivation_history as h
        where h.user_id = v_user and h.quote_id = q.id
      )
    order by random()
    limit 1;
  end if;

  if not found then
    delete from public.user_motivation_history as h where h.user_id = v_user;
    select q.* into v_quote
    from public.motivation_quotes as q
    where q.active = true
    order by random()
    limit 1;
  end if;

  if not found then
    raise exception 'No active motivation quotes';
  end if;

  insert into public.user_motivation_history(user_id, quote_id, display_date)
  values (v_user, v_quote.id, p_local_date)
  on conflict (user_id, display_date) do nothing;

  select q.id as id, q.quote as quote, q.category as category, h.display_date as shown_on
    into v_existing
  from public.user_motivation_history as h
  join public.motivation_quotes as q on q.id = h.quote_id
  where h.user_id = v_user and h.display_date = p_local_date;

  return query
    select v_existing.id, v_existing.quote, v_existing.category, v_existing.shown_on,
           (v_existing.id <> v_quote.id);
end;
$function$;

revoke all on function public.get_daily_motivation(date) from public, anon;
grant execute on function public.get_daily_motivation(date) to authenticated;

-- The rota import RPC is intentionally SECURITY DEFINER so its multi-table
-- update is atomic while browser clients retain no direct write privileges to
-- audit/version tables. Its body independently verifies auth.uid() ownership.
revoke all on function public.confirm_rota_import(uuid, text, jsonb, date, date) from public, anon;
grant execute on function public.confirm_rota_import(uuid, text, jsonb, date, date) to authenticated;

-- Explicitly scope owner policies to authenticated sessions and use scalar
-- subqueries for auth.uid() so PostgreSQL can evaluate the value once per
-- statement rather than once per row.
alter policy "audit owner read" on public.audit_events
  to authenticated using (user_id = (select auth.uid()));

alter policy "Users can read their own daily motivation" on public.daily_motivations
  to authenticated using (user_id = (select auth.uid()));

alter policy "profile owner read" on public.profiles
  to authenticated using (id = (select auth.uid()));

alter policy "profile owner insert" on public.profiles
  to authenticated with check (id = (select auth.uid()));

alter policy "profile owner update" on public.profiles
  to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "import owner all" on public.rota_imports
  to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "rotation owner all" on public.rotations
  to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "note owner all" on public.shift_notes
  to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "version owner read" on public.shift_versions
  to authenticated using (user_id = (select auth.uid()));

alter policy "shift owner all" on public.shifts
  to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users can read own motivation history" on public.user_motivation_history
  to authenticated using (user_id = (select auth.uid()));

-- Indexes cover foreign keys and common owner-scoped lookups reported by the
-- Supabase performance advisor.
create index if not exists audit_events_user_id_idx on public.audit_events(user_id);
create index if not exists profiles_organisation_id_idx on public.profiles(organisation_id);
create index if not exists rota_imports_rotation_id_idx on public.rota_imports(rotation_id);
create index if not exists rota_imports_user_id_idx on public.rota_imports(user_id);
create index if not exists rotations_organisation_id_idx on public.rotations(organisation_id);
create index if not exists shift_notes_shift_id_idx on public.shift_notes(shift_id);
create index if not exists shift_versions_user_id_idx on public.shift_versions(user_id);
create index if not exists shifts_import_id_idx on public.shifts(import_id);
create index if not exists user_motivation_history_quote_id_idx on public.user_motivation_history(quote_id);

-- Composite unique keys let the database enforce tenant ownership across
-- relationships, not merely on each table independently.
create unique index if not exists rotations_user_id_id_uidx on public.rotations(user_id, id);
create unique index if not exists rota_imports_user_id_id_uidx on public.rota_imports(user_id, id);
create unique index if not exists shifts_user_id_id_uidx on public.shifts(user_id, id);

alter table public.rota_imports
  add constraint rota_imports_user_rotation_owner_fkey
  foreign key (user_id, rotation_id) references public.rotations(user_id, id)
  on delete cascade not valid;

alter table public.shifts
  add constraint shifts_user_rotation_owner_fkey
  foreign key (user_id, rotation_id) references public.rotations(user_id, id)
  on delete cascade not valid;

alter table public.shifts
  add constraint shifts_user_import_owner_fkey
  foreign key (user_id, import_id) references public.rota_imports(user_id, id)
  not valid;

alter table public.shift_notes
  add constraint shift_notes_user_shift_owner_fkey
  foreign key (user_id, shift_id) references public.shifts(user_id, id)
  on delete cascade not valid;

alter table public.rota_imports validate constraint rota_imports_user_rotation_owner_fkey;
alter table public.shifts validate constraint shifts_user_rotation_owner_fkey;
alter table public.shifts validate constraint shifts_user_import_owner_fkey;
alter table public.shift_notes validate constraint shift_notes_user_shift_owner_fkey;

commit;
