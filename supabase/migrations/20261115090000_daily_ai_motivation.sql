-- AI Motivation Engine: per-user daily quote history and bounded generation attempts.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.daily_motivations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  quote text not null check (char_length(quote) between 25 and 220),
  theme text not null default 'personalised',
  quote_hash text not null,
  model text not null default 'gpt-4o-mini',
  created_at timestamptz not null default now(),
  constraint daily_motivations_user_date_unique unique (user_id, local_date),
  constraint daily_motivations_user_hash_unique unique (user_id, quote_hash)
);
create index if not exists daily_motivations_user_created_idx on public.daily_motivations (user_id, created_at desc);
create index if not exists daily_motivations_quote_trgm_idx on public.daily_motivations using gin (quote extensions.gin_trgm_ops);
alter table public.daily_motivations enable row level security;
drop policy if exists "Users can read their own daily motivation" on public.daily_motivations;
create policy "Users can read their own daily motivation" on public.daily_motivations for select to authenticated using (auth.uid() = user_id);
revoke all on public.daily_motivations from anon, authenticated;
grant select on public.daily_motivations to authenticated;

create table if not exists public.motivation_generation_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  attempts integer not null default 0 check (attempts between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.motivation_generation_claims enable row level security;
revoke all on public.motivation_generation_claims from anon, authenticated;

create or replace function public.claim_daily_motivation_generation(p_user_id uuid, p_local_date date)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'not authorised'; end if;
  insert into public.motivation_generation_claims(user_id, local_date, attempts)
  values (p_user_id, p_local_date, 1)
  on conflict (user_id, local_date) do update
    set attempts = public.motivation_generation_claims.attempts + 1, updated_at = now()
    where public.motivation_generation_claims.attempts < 2
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.claim_daily_motivation_generation(uuid,date) from public, anon, authenticated;
grant execute on function public.claim_daily_motivation_generation(uuid,date) to service_role;
