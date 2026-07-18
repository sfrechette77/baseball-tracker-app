begin;

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
  v_organization_id uuid;
  v_athlete_ids uuid[];
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

  select coalesce(
    array_agg(distinct selected.athlete_id),
    '{}'::uuid[]
  )
  into v_athlete_ids
  from unnest(
    coalesce(p_athlete_ids, '{}'::uuid[])
  ) as selected(athlete_id)
  where selected.athlete_id is not null;

  if p_primary_athlete_id is not null
    and not (p_primary_athlete_id = any(v_athlete_ids))
  then
    raise exception 'Primary athlete must be one of the selected athletes';
  end if;

  select count(*)::integer
  into v_valid_athlete_count
  from public.athletes athlete
  where athlete.id = any(v_athlete_ids)
    and athlete.organization_id = v_organization_id
    and athlete.status <> 'archived';

  if v_valid_athlete_count <> cardinality(v_athlete_ids) then
    raise exception 'One or more athletes are not eligible for this organization';
  end if;

  -- Add new relationships and update the primary designation on retained rows.
  -- Existing relationship labels are preserved because they are not overwritten.
  insert into public.guardian_athletes (
    organization_id,
    membership_id,
    athlete_id,
    is_primary
  )
  select
    v_organization_id,
    p_membership_id,
    selected.athlete_id,
    selected.athlete_id = p_primary_athlete_id
  from unnest(v_athlete_ids) as selected(athlete_id)
  on conflict (membership_id, athlete_id)
  do update set
    is_primary = excluded.is_primary,
    updated_at = now();

  -- Remove relationships that are no longer selected.
  delete from public.guardian_athletes guardian
  where guardian.membership_id = p_membership_id
    and not (guardian.athlete_id = any(v_athlete_ids));

  return query
  select
    p_membership_id,
    cardinality(v_athlete_ids);
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

commit;