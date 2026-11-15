-- Harden rota import confirmation and make replacement scope explicit.
-- Apply only after the matching frontend release is ready.
drop function if exists public.confirm_rota_import(uuid, text, jsonb);

create function public.confirm_rota_import(
  p_rotation_id uuid,
  p_filename text,
  p_shifts jsonb,
  p_replace_start_date date,
  p_replace_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_import uuid;
  v_row jsonb;
  v_existing public.shifts%rowtype;
  v_shift_id uuid;
  v_date date;
  v_type text;
  v_start time;
  v_end time;
  v_ward text;
  v_imported integer := 0;
  v_duplicates integer := 0;
  v_seen uuid[] := '{}'::uuid[];
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_filename is null or length(btrim(p_filename)) = 0 or length(p_filename) > 255 then
    raise exception 'Invalid filename';
  end if;

  if p_replace_start_date is null or p_replace_end_date is null
     or p_replace_end_date < p_replace_start_date then
    raise exception 'Invalid replacement date range';
  end if;

  if jsonb_typeof(p_shifts) is distinct from 'array' then
    raise exception 'Shifts must be supplied as an array';
  end if;
  if jsonb_array_length(p_shifts) = 0 then
    raise exception 'No shifts supplied';
  end if;

  if jsonb_array_length(p_shifts) > 10000 then
    raise exception 'Import exceeds 10,000 shift limit';
  end if;

  if not exists (
    select 1 from public.rotations r
    where r.id = p_rotation_id and r.user_id = v_user and r.archived = false
  ) then
    raise exception 'Rotation not found or access denied' using errcode = '42501';
  end if;

  -- Validate the entire payload before any destructive replacement occurs.
  for v_row in select element.value from jsonb_array_elements(p_shifts) as element(value)
  loop
    if nullif(btrim(v_row->>'shift_date'), '') is null
       or nullif(btrim(v_row->>'shift_type'), '') is null
       or nullif(btrim(v_row->>'start_time'), '') is null
       or nullif(btrim(v_row->>'end_time'), '') is null
       or nullif(btrim(v_row->>'ward'), '') is null then
      raise exception 'Every shift requires date, shift type, start time, end time and ward';
    end if;

    v_date := (v_row->>'shift_date')::date;
    v_start := (v_row->>'start_time')::time;
    v_end := (v_row->>'end_time')::time;

    if v_date < p_replace_start_date or v_date > p_replace_end_date then
      raise exception 'A shift falls outside the selected replacement date range';
    end if;
  end loop;

  insert into public.rota_imports(user_id, rotation_id, filename, status, matched_count)
  values (v_user, p_rotation_id, p_filename, 'previewed', 0)
  returning id into v_import;

  for v_row in select element.value from jsonb_array_elements(p_shifts) as element(value)
  loop
    v_date := (v_row->>'shift_date')::date;
    v_type := nullif(btrim(v_row->>'shift_type'), '');
    v_start := (v_row->>'start_time')::time;
    v_end := (v_row->>'end_time')::time;
    v_ward := nullif(btrim(v_row->>'ward'), '');

    -- Preserve a stable shift ID for an unchanged assignment, including its notes.
    select s.id into v_shift_id
    from public.shifts s
    where s.user_id = v_user
      and s.rotation_id = p_rotation_id
      and s.archived = false
      and s.shift_date = v_date
      and s.shift_type = v_type
      and s.start_time = v_start
      and s.end_time = v_end
      and s.ward = v_ward
    order by s.created_at
    limit 1
    for update;

    if found then
      if not (v_shift_id = any(v_seen)) then
        v_seen := array_append(v_seen, v_shift_id);
        v_duplicates := v_duplicates + 1;
      end if;
      continue;
    end if;

    -- If the same date/type has changed details, version and update the existing row.
    select s.* into v_existing
    from public.shifts s
    where s.user_id = v_user
      and s.rotation_id = p_rotation_id
      and s.archived = false
      and s.shift_date = v_date
      and s.shift_type = v_type
    order by s.created_at
    limit 1
    for update;

    if found then
      insert into public.shift_versions(user_id, shift_id, snapshot, change_reason)
      values (v_user, v_existing.id, to_jsonb(v_existing), 'rota re-import changed assignment');

      update public.shifts
      set start_time = v_start,
          end_time = v_end,
          ward = v_ward,
          import_id = v_import,
          updated_at = now()
      where id = v_existing.id and user_id = v_user;

      v_shift_id := v_existing.id;
    else
      insert into public.shifts(
        user_id, rotation_id, import_id, shift_date, shift_type,
        start_time, end_time, ward, timezone
      )
      values (
        v_user, p_rotation_id, v_import, v_date, v_type,
        v_start, v_end, v_ward,
        coalesce((select p.timezone from public.profiles p where p.id = v_user), 'Europe/London')
      )
      returning id into v_shift_id;
    end if;

    v_seen := array_append(v_seen, v_shift_id);
    v_imported := v_imported + 1;
  end loop;

  -- Only archive unmatched shifts inside the user's explicitly selected range
  -- and selected rotation. Notes remain attached to the archived shift record.
  update public.shifts s
  set archived = true, updated_at = now()
  where s.user_id = v_user
    and s.rotation_id = p_rotation_id
    and s.archived = false
    and s.shift_date between p_replace_start_date and p_replace_end_date
    and not (s.id = any(v_seen));

  update public.rota_imports
  set status = 'confirmed',
      matched_count = v_imported,
      duplicate_count = v_duplicates
  where id = v_import and user_id = v_user;

  insert into public.audit_events(user_id, event_type, metadata)
  values (
    v_user,
    'rota.import.confirmed',
    jsonb_build_object(
      'rotation_id', p_rotation_id,
      'import_id', v_import,
      'imported_count', v_imported,
      'duplicate_count', v_duplicates,
      'replace_start_date', p_replace_start_date,
      'replace_end_date', p_replace_end_date
    )
  );

  return jsonb_build_object(
    'import_id', v_import,
    'imported_count', v_imported,
    'duplicate_count', v_duplicates
  );
end;
$function$;

revoke all on function public.confirm_rota_import(uuid, text, jsonb, date, date) from public, anon;
grant execute on function public.confirm_rota_import(uuid, text, jsonb, date, date) to authenticated;
