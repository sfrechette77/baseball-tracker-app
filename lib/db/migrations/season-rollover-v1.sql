create or replace function public.start_new_season(
  p_organization_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_copy_rosters boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_new_season_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_org_admin(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Season name is required';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Start date and end date are required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date must be after start date';
  end if;

  -- Turn off any existing current season for this organization.
  update public.seasons
  set is_current = false,
      updated_at = now()
  where organization_id = p_organization_id
    and is_current = true;

  -- Create the new current season.
  insert into public.seasons (
    organization_id,
    name,
    start_date,
    end_date,
    is_current
  )
  values (
    p_organization_id,
    trim(p_name),
    p_start_date,
    p_end_date,
    true
  )
  returning id into v_new_season_id;

  -- Create team_seasons rows for every real org team.
  insert into public.team_seasons (
    organization_id,
    team_id,
    season_id,
    age_group,
    head_coach_name
  )
  select
    t.organization_id,
    t.id,
    v_new_season_id,
    null,
    null
  from public.teams t
  where t.organization_id = p_organization_id
    and t.is_opponent = false
  on conflict (team_id, season_id) do nothing;

  -- Optional roster copy-forward.
  if p_copy_rosters then
    insert into public.players (
      name,
      jersey_number,
      position,
      team_id,
      organization_id,
      team_season_id
    )
    select
      p.name,
      p.jersey_number,
      p.position,
      p.team_id,
      p.organization_id,
      new_ts.id
    from public.players p
    join public.team_seasons old_ts
      on old_ts.id = p.team_season_id
    join public.seasons old_s
      on old_s.id = old_ts.season_id
    join public.team_seasons new_ts
      on new_ts.team_id = old_ts.team_id
     and new_ts.season_id = v_new_season_id
    where p.organization_id = p_organization_id
      and old_ts.organization_id = p_organization_id
      and old_s.organization_id = p_organization_id
      and old_s.id <> v_new_season_id
      and old_s.start_date = (
        select max(s2.start_date)
        from public.seasons s2
        where s2.organization_id = p_organization_id
          and s2.id <> v_new_season_id
      );
  end if;

  return v_new_season_id;
end;
$$;