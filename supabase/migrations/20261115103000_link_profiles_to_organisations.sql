-- Link each ShiftMate profile and rotation to a canonical healthcare organisation.
create unique index if not exists organisations_name_ci_uidx
  on public.organisations (lower(btrim(name)));

alter table public.profiles
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null;

alter table public.rotations
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null;

drop policy if exists "organisation insert authenticated" on public.organisations;
create policy "organisation insert authenticated"
  on public.organisations for insert to authenticated
  with check (
    char_length(btrim(name)) between 2 and 180
    and country_code ~ '^[A-Z]{2}$'
    and organisation_type = 'healthcare'
  );
grant select, insert on public.organisations to authenticated;
