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
    player.athlete_id
  into
    v_team_season_id,
    v_organization_id,
    v_athlete_id
  from public.players player
  where player.id = p_player_id;

  if v_team_season_id is null then
    raise exception 'Roster assignment not found';
  end if;

  if not public.can_admin_team_season(v_team_season_id) then
    raise exception 'Not authorized';
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

  -- The athlete name is durable and should stay consistent across seasons.
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