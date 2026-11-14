-- Add 1536-dimensional OpenAI embeddings for semantic duplicate detection.
create extension if not exists vector with schema extensions;
alter table public.daily_motivations add column if not exists embedding extensions.vector(1536);

create or replace function public.has_similar_daily_motivation(
  p_user_id uuid,
  p_quote text,
  p_embedding extensions.vector(1536)
) returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.daily_motivations m
    where m.user_id = p_user_id
      and (
        (m.embedding is not null and (m.embedding <=> p_embedding) < 0.18)
        or extensions.similarity(m.quote, p_quote) >= 0.42
      )
  );
$$;
revoke all on function public.has_similar_daily_motivation(uuid,text,extensions.vector) from public, anon, authenticated;
grant execute on function public.has_similar_daily_motivation(uuid,text,extensions.vector) to service_role;
