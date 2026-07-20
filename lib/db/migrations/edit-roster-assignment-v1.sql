begin;

-- Update a seasonal roster assignment and its permanent athlete identity.
--
-- Display name is stored on the durable athlete record and synchronized to
-- every linked seasonal players row. Jersey number and position apply only
-- to the selected seasonal assignment.

create or replace function public.update_roster_assignment(
  p_player_id uuid,
  p_display_name text,
  p_jersey_number text default null,
  p_position text default null
)
returns table (
  result_player_id uuid,
  result_athlete_id uuid,
  result_display_name text,
  result_jersey_number text,
  result_position text
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_team_season_id uuid;
  v_organization_id uuid;
  v_athlete_id uuid;
  v_display_name text;
  v_jersey_number text;
  v_position text;
  v_roster_status text;
  v_current_display_name text;
  v_is_org_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_display_name := nullif(trim(p_display_name), '');
  v_jersey_number := nullif(trim(p_jersey_number), '');
  v_position := nullif(trim(p_position), '');

  if v_display_name is null then
    raise exception 'Player name is required';
  end if;

    select
      player.team_season_id,
      player.organization_id,
      player.athlete_id,
      player.roster_status,
      coalesce(athlete.display_name, player.name)
    into
      v_team_season_id,
      v_organization_id,
      v_athlete_id,
      v_roster_status,
      v_current_display_name
    from public.players player
    left join public.athletes athlete
      on athlete.id = player.athlete_id
    and athlete.organization_id = player.organization_id
    where player.id = p_player_id;

  if v_team_season_id is null then
    raise exception 'Roster assignment not found';
  end if;

  if v_roster_status is distinct from 'active' then
    raise exception 'Only active roster assignments can be edited';
  end if;

  if not public.can_admin_team_season(v_team_season_id) then
    raise exception 'Not authorized';
  end if;

  v_is_org_admin := public.is_org_admin(v_organization_id);

  if not v_is_org_admin
     and v_display_name is distinct from v_current_display_name then
    raise exception 'Only organization admins can change athlete names';
  end if;

  if not v_is_org_admin then
    v_display_name := v_current_display_name;
  end if;

  -- Repair a legacy roster row that is missing a permanent athlete identity.
  if v_athlete_id is null then
    insert into public.athletes (
      organization_id,
      display_name
    )
    values (
      v_organization_id,
      v_display_name
    )
    returning id into v_athlete_id;

    update public.players player
    set athlete_id = v_athlete_id
    where player.id = p_player_id;
  end if;

  -- Only org admins may change the durable athlete name.
  if v_is_org_admin then
    update public.athletes athlete
    set display_name = v_display_name
    where athlete.id = v_athlete_id
      and athlete.organization_id = v_organization_id;

    if not found then
      raise exception 'Athlete identity not found';
    end if;

    update public.players player
    set name = v_display_name
    where player.athlete_id = v_athlete_id
      and player.organization_id = v_organization_id;
  end if;

  -- Jersey and position are specific to this seasonal assignment.
  update public.players player
  set
    jersey_number = v_jersey_number,
    position = v_position
  where player.id = p_player_id;

  return query
  select
    player.id,
    player.athlete_id,
    player.name,
    player.jersey_number,
    player.position
  from public.players player
  where player.id = p_player_id;
end;
$function$;

revoke all on function public.update_roster_assignment(
  uuid,
  text,
  text,
  text
) from public;

grant execute on function public.update_roster_assignment(
  uuid,
  text,
  text,
  text
) to authenticated;
commit;