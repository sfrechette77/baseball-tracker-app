begin;

-- ─── Seasonal roster status ─────────────────────────────────────────────────

alter table public.players
  add column if not exists roster_status text;

alter table public.players
  add column if not exists removed_at timestamptz;

alter table public.players
  add column if not exists removed_reason text;

update public.players
set roster_status = 'active'
where roster_status is null;

alter table public.players
  alter column roster_status set default 'active';

alter table public.players
  alter column roster_status set not null;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_roster_status_valid'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_roster_status_valid
      check (roster_status in ('active', 'inactive'));
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_removed_reason_not_blank'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_removed_reason_not_blank
      check (
        removed_reason is null
        or length(trim(removed_reason)) > 0
      );
  end if;
end;
$block$;

create index if not exists idx_players_team_season_roster_status
  on public.players (team_season_id, roster_status);


-- ─── Remove a seasonal roster assignment ────────────────────────────────────

create or replace function public.remove_player_from_roster(
  p_player_id uuid,
  p_reason text default null
)
returns table (
  result_player_id uuid,
  result_roster_status text,
  result_removed_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_team_season_id uuid;
  v_player_id uuid;
  v_roster_status text;
  v_removed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.team_season_id
  into v_team_season_id
  from public.players p
  where p.id = p_player_id;

  if v_team_season_id is null then
    raise exception 'Roster assignment not found';
  end if;

  if not public.can_admin_team_season(v_team_season_id) then
    raise exception 'Not authorized';
  end if;

  update public.players p
  set
    roster_status = 'inactive',
    removed_at = now(),
    removed_reason = nullif(trim(p_reason), '')
  where p.id = p_player_id
  returning
    p.id,
    p.roster_status,
    p.removed_at
  into
    v_player_id,
    v_roster_status,
    v_removed_at;

  return query
  select
    v_player_id,
    v_roster_status,
    v_removed_at;
end;
$function$;


-- ─── Restore a seasonal roster assignment ───────────────────────────────────

create or replace function public.restore_player_to_roster(
  p_player_id uuid
)
returns table (
  result_player_id uuid,
  result_roster_status text,
  result_removed_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_team_season_id uuid;
  v_player_id uuid;
  v_roster_status text;
  v_removed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.team_season_id
  into v_team_season_id
  from public.players p
  where p.id = p_player_id;

  if v_team_season_id is null then
    raise exception 'Roster assignment not found';
  end if;

  if not public.can_admin_team_season(v_team_season_id) then
    raise exception 'Not authorized';
  end if;

  update public.players p
  set
    roster_status = 'active',
    removed_at = null,
    removed_reason = null
  where p.id = p_player_id
  returning
    p.id,
    p.roster_status,
    p.removed_at
  into
    v_player_id,
    v_roster_status,
    v_removed_at;

  return query
  select
    v_player_id,
    v_roster_status,
    v_removed_at;
end;
$function$;


revoke all on function public.remove_player_from_roster(
  uuid,
  text
) from public;

revoke all on function public.restore_player_to_roster(
  uuid
) from public;

grant execute on function public.remove_player_from_roster(
  uuid,
  text
) to authenticated;

grant execute on function public.restore_player_to_roster(
  uuid
) to authenticated;

commit;