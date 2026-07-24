begin;

-- Accept relationship details while preserving the same authorization,
-- organization, eligibility, and replacement behavior as the v1 RPC.
create or replace function public.replace_guardian_athlete_details(
  p_membership_id uuid,
  p_assignments jsonb,
  p_primary_athlete_id uuid default null
)
returns table (
  result_membership_id uuid,
  result_assigned_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_organization_id uuid;
  v_assignments jsonb := coalesce(p_assignments, '[]'::jsonb);
  v_assignment_count integer;
  v_valid_athlete_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select membership.organization_id
  into v_organization_id
  from public.memberships membership
  where membership.id = p_membership_id
    and membership.role = 'parent'
    and membership.status = 'approved';

  if v_organization_id is null then
    raise exception 'Approved parent membership not found';
  end if;

  if not public.is_org_admin(v_organization_id) then
    raise exception 'Not authorized';
  end if;

  if jsonb_typeof(v_assignments) <> 'array' then
    raise exception 'Athlete assignments must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_assignments) assignment
    where jsonb_typeof(assignment) <> 'object'
      or nullif(btrim(assignment ->> 'athlete_id'), '') is null
  ) then
    raise exception 'Every athlete assignment must include an athlete_id';
  end if;

  -- Reject duplicate athlete IDs instead of choosing one relationship value
  -- unpredictably.
  if exists (
    select parsed.athlete_id
    from (
      select
        (assignment ->> 'athlete_id')::uuid as athlete_id
      from jsonb_array_elements(v_assignments) assignment
    ) parsed
    group by parsed.athlete_id
    having count(*) > 1
  ) then
    raise exception 'Athlete assignments must not contain duplicates';
  end if;

  v_assignment_count := jsonb_array_length(v_assignments);

  if p_primary_athlete_id is not null
    and not exists (
      select 1
      from jsonb_array_elements(v_assignments) assignment
      where (assignment ->> 'athlete_id')::uuid =
        p_primary_athlete_id
    )
  then
    raise exception 'Primary athlete must be one of the selected athletes';
  end if;

  select count(*)::integer
  into v_valid_athlete_count
  from public.athletes athlete
  where athlete.organization_id = v_organization_id
    and athlete.status <> 'archived'
    and athlete.id in (
      select
        (assignment ->> 'athlete_id')::uuid
      from jsonb_array_elements(v_assignments) assignment
    );

  if v_valid_athlete_count <> v_assignment_count then
    raise exception
      'One or more athletes are not eligible for this organization';
  end if;

  -- Clear the old primary before assigning the new one. This makes switching
  -- primary athletes compatible with the partial unique index below.
  update public.guardian_athletes guardian
  set
    is_primary = false,
    updated_at = now()
  where guardian.membership_id = p_membership_id
    and guardian.is_primary = true;

  insert into public.guardian_athletes (
    organization_id,
    membership_id,
    athlete_id,
    relationship,
    is_primary
  )
  select
    v_organization_id,
    p_membership_id,
    (assignment ->> 'athlete_id')::uuid,
    nullif(btrim(assignment ->> 'relationship'), ''),
    (assignment ->> 'athlete_id')::uuid =
      p_primary_athlete_id
  from jsonb_array_elements(v_assignments) assignment
  on conflict (membership_id, athlete_id)
  do update set
    relationship = excluded.relationship,
    is_primary = excluded.is_primary,
    updated_at = now();

  delete from public.guardian_athletes guardian
  where guardian.membership_id = p_membership_id
    and not exists (
      select 1
      from jsonb_array_elements(v_assignments) assignment
      where (assignment ->> 'athlete_id')::uuid =
        guardian.athlete_id
    );

  return query
  select
    p_membership_id,
    v_assignment_count;
end;
$function$;

revoke all on function public.replace_guardian_athlete_details(
  uuid,
  jsonb,
  uuid
) from public;

grant execute on function public.replace_guardian_athlete_details(
  uuid,
  jsonb,
  uuid
) to authenticated;


-- Keep the original RPC available for older application deployments and
-- preserve existing relationship labels when it is used.
create or replace function public.replace_guardian_athletes(
  p_membership_id uuid,
  p_athlete_ids uuid[],
  p_primary_athlete_id uuid default null
)
returns table (
  result_membership_id uuid,
  result_assigned_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_assignments jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'athlete_id',
        selected.athlete_id,
        'relationship',
        guardian.relationship
      )
      order by selected.athlete_id
    ),
    '[]'::jsonb
  )
  into v_assignments
  from (
    select distinct input.athlete_id
    from unnest(
      coalesce(p_athlete_ids, '{}'::uuid[])
    ) as input(athlete_id)
    where input.athlete_id is not null
  ) selected
  left join public.guardian_athletes guardian
    on guardian.membership_id = p_membership_id
   and guardian.athlete_id = selected.athlete_id;

  return query
  select *
  from public.replace_guardian_athlete_details(
    p_membership_id,
    v_assignments,
    p_primary_athlete_id
  );
end;
$function$;

revoke all on function public.replace_guardian_athletes(
  uuid,
  uuid[],
  uuid
) from public;

grant execute on function public.replace_guardian_athletes(
  uuid,
  uuid[],
  uuid
) to authenticated;


-- Do not silently repair invalid existing data. Abort the migration if a
-- membership somehow already has multiple primary athletes.
do $block$
begin
  if exists (
    select guardian.membership_id
    from public.guardian_athletes guardian
    where guardian.is_primary = true
    group by guardian.membership_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce primary-athlete uniqueness: duplicate primary rows exist';
  end if;
end;
$block$;

create unique index if not exists
  idx_guardian_athletes_one_primary_per_membership
on public.guardian_athletes (membership_id)
where is_primary = true;

commit;