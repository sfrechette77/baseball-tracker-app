begin;

-- ─── Create a new athlete and seasonal roster assignment ────────────────────

create or replace function public.create_athlete_roster_assignment(
  p_team_season_id uuid,
  p_display_name text,
  p_jersey_number text default null,
  p_position text default null
)
returns table (
  athlete_id uuid,
  player_id uuid,
  organization_id uuid,
  team_id uuid,
  team_season_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_organization_id uuid;
  v_team_id uuid;
  v_athlete_id uuid;
  v_player_id uuid;
  v_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_display_name := nullif(trim(p_display_name), '');

  if v_display_name is null then
    raise exception 'Player name is required';
  end if;

  select
    ts.organization_id,
    ts.team_id
  into
    v_organization_id,
    v_team_id
  from public.team_seasons ts
  join public.teams t
    on t.id = ts.team_id
  where ts.id = p_team_season_id
    and t.is_opponent = false;

  if v_organization_id is null or v_team_id is null then
    raise exception 'Team-season not found';
  end if;

  if not public.can_admin_team_season(p_team_season_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.athletes (
    organization_id,
    display_name
  )
  values (
    v_organization_id,
    v_display_name
  )
  returning id into v_athlete_id;

  insert into public.players (
    athlete_id,
    name,
    jersey_number,
    position,
    team_id,
    organization_id,
    team_season_id
  )
  values (
    v_athlete_id,
    v_display_name,
    nullif(trim(p_jersey_number), ''),
    nullif(trim(p_position), ''),
    v_team_id,
    v_organization_id,
    p_team_season_id
  )
  returning id into v_player_id;

  return query
  select
    v_athlete_id,
    v_player_id,
    v_organization_id,
    v_team_id,
    p_team_season_id;
end;
$function$;


-- ─── Assign an existing athlete to a seasonal roster ────────────────────────

create or replace function public.assign_existing_athlete_to_team_season(
  p_athlete_id uuid,
  p_team_season_id uuid,
  p_jersey_number text default null,
  p_position text default null
)
returns table (
  athlete_id uuid,
  player_id uuid,
  organization_id uuid,
  team_id uuid,
  team_season_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_organization_id uuid;
  v_team_id uuid;
  v_athlete_organization_id uuid;
  v_display_name text;
  v_athlete_status text;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select
    ts.organization_id,
    ts.team_id
  into
    v_organization_id,
    v_team_id
  from public.team_seasons ts
  join public.teams t
    on t.id = ts.team_id
  where ts.id = p_team_season_id
    and t.is_opponent = false;

  if v_organization_id is null or v_team_id is null then
    raise exception 'Team-season not found';
  end if;

  if not public.can_admin_team_season(p_team_season_id) then
    raise exception 'Not authorized';
  end if;

  select
    a.organization_id,
    a.display_name,
    a.status
  into
    v_athlete_organization_id,
    v_display_name,
    v_athlete_status
  from public.athletes a
  where a.id = p_athlete_id;

  if v_athlete_organization_id is null then
    raise exception 'Athlete not found';
  end if;

  if v_athlete_organization_id <> v_organization_id then
    raise exception 'Athlete and team-season belong to different organizations';
  end if;

  if v_athlete_status = 'archived' then
    raise exception 'Archived athletes cannot be assigned to a roster';
  end if;

  -- Org admins may transfer athletes across teams.
  -- Team admins may only reassign an athlete who previously belonged
  -- to the same permanent team as the destination team-season.
  if not public.is_org_admin(v_organization_id) then
    if not exists (
      select 1
      from public.players previous_player
      join public.team_seasons previous_team_season
        on previous_team_season.id = previous_player.team_season_id
      where previous_player.athlete_id = p_athlete_id
        and previous_team_season.organization_id = v_organization_id
        and previous_team_season.team_id = v_team_id
    ) then
      raise exception
        'Team admins may only reassign athletes who previously belonged to this team';
    end if;
  end if;

  if exists (
    select 1
    from public.players p
    where p.athlete_id = p_athlete_id
      and p.team_season_id = p_team_season_id
  ) then
    raise exception 'Athlete is already assigned to this roster';
  end if;

  insert into public.players (
    athlete_id,
    name,
    jersey_number,
    position,
    team_id,
    organization_id,
    team_season_id
  )
  values (
    p_athlete_id,
    v_display_name,
    nullif(trim(p_jersey_number), ''),
    nullif(trim(p_position), ''),
    v_team_id,
    v_organization_id,
    p_team_season_id
  )
  returning id into v_player_id;

  return query
  select
    p_athlete_id,
    v_player_id,
    v_organization_id,
    v_team_id,
    p_team_season_id;
end;
$function$;


revoke all on function public.create_athlete_roster_assignment(
  uuid,
  text,
  text,
  text
) from public;

revoke all on function public.assign_existing_athlete_to_team_season(
  uuid,
  uuid,
  text,
  text
) from public;

grant execute on function public.create_athlete_roster_assignment(
  uuid,
  text,
  text,
  text
) to authenticated;

grant execute on function public.assign_existing_athlete_to_team_season(
  uuid,
  uuid,
  text,
  text
) to authenticated;

commit;
