begin;

-- ---------------------------------------------------------------------------
-- 1. Season-specific team identity
-- ---------------------------------------------------------------------------

alter table public.team_seasons
  add column if not exists display_name text,
  add column if not exists division text;

-- Backfill existing seasons from the permanent team record.
-- This preserves today's behavior until individual season rows are customized.
update public.team_seasons ts
set
  display_name = coalesce(
    nullif(trim(ts.display_name), ''),
    t.name
  ),
  division = coalesce(
    nullif(trim(ts.division), ''),
    t.division
  )
from public.teams t
where t.id = ts.team_id
  and (
    ts.display_name is null
    or nullif(trim(ts.display_name), '') is null
    or ts.division is null
    or nullif(trim(ts.division), '') is null
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_seasons_display_name_not_blank'
      and conrelid = 'public.team_seasons'::regclass
  ) then
    alter table public.team_seasons
      add constraint team_seasons_display_name_not_blank
      check (
        display_name is null
        or nullif(trim(display_name), '') is not null
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_seasons_division_not_blank'
      and conrelid = 'public.team_seasons'::regclass
  ) then
    alter table public.team_seasons
      add constraint team_seasons_division_not_blank
      check (
        division is null
        or nullif(trim(division), '') is not null
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Season-aware computed standings
--
-- Keep the original columns first and append team_season_id / season_id /
-- age_group so existing callers remain compatible while new callers can
-- filter explicitly by season.
-- ---------------------------------------------------------------------------

create or replace view public.computed_standings
with (security_invoker = true) as
with game_results as (
  select
    lg.home_team_season_id as team_season_id,
    lg.home_score as runs_for,
    lg.away_score as runs_against,
    case
      when lg.home_score > lg.away_score then 'win'::text
      when lg.home_score < lg.away_score then 'loss'::text
      else 'tie'::text
    end as result
  from public.league_games lg
  where lg.status = 'final'
    and lg.home_score is not null
    and lg.away_score is not null
    and lg.home_team_season_id is not null

  union all

  select
    lg.away_team_season_id as team_season_id,
    lg.away_score as runs_for,
    lg.home_score as runs_against,
    case
      when lg.away_score > lg.home_score then 'win'::text
      when lg.away_score < lg.home_score then 'loss'::text
      else 'tie'::text
    end as result
  from public.league_games lg
  where lg.status = 'final'
    and lg.home_score is not null
    and lg.away_score is not null
    and lg.away_team_season_id is not null
),
team_stats as (
  select
    ts.team_id,
    ts.id as team_season_id,
    ts.season_id,
    coalesce(
      nullif(trim(ts.display_name), ''),
      t.name
    ) as team_name,
    coalesce(
      nullif(trim(ts.division), ''),
      t.division
    ) as division,
    ts.age_group,
    ts.organization_id,
    coalesce(count(gr.team_season_id), 0)::integer as games_played,
    coalesce(sum(case when gr.result = 'win' then 1 else 0 end), 0)::integer as wins,
    coalesce(sum(case when gr.result = 'loss' then 1 else 0 end), 0)::integer as losses,
    coalesce(sum(case when gr.result = 'tie' then 1 else 0 end), 0)::integer as ties,
    coalesce(sum(gr.runs_for), 0)::integer as runs_for,
    coalesce(sum(gr.runs_against), 0)::integer as runs_against
  from public.team_seasons ts
  join public.teams t
    on t.id = ts.team_id
  left join game_results gr
    on gr.team_season_id = ts.id
  group by
    ts.team_id,
    ts.id,
    ts.season_id,
    ts.display_name,
    ts.division,
    ts.age_group,
    ts.organization_id,
    t.name,
    t.division
)
select
  team_id as id,
  team_name,
  division,
  games_played,
  wins,
  losses,
  ties,
  runs_for,
  runs_against,
  case
    when games_played = 0 then 0::numeric
    else round(
      (wins::numeric + ties::numeric * 0.5)
      / games_played::numeric,
      4
    )
  end as win_pct,
  organization_id,
  team_season_id,
  season_id,
  age_group
from team_stats
order by
  case
    when games_played = 0 then 0::numeric
    else round(
      (wins::numeric + ties::numeric * 0.5)
      / games_played::numeric,
      4
    )
  end desc,
  wins desc,
  runs_against,
  runs_for desc;

-- ---------------------------------------------------------------------------
-- 3. Future season rollover
--
-- Seed display name/division from the most recent prior team-season.
-- They remain editable season-specific values; we do not attempt to guess
-- age progression (11U -> 12U) automatically.
-- ---------------------------------------------------------------------------

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

  update public.seasons
  set
    is_current = false,
    updated_at = now()
  where organization_id = p_organization_id
    and is_current = true;

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

  insert into public.team_seasons (
    organization_id,
    team_id,
    season_id,
    display_name,
    division,
    age_group,
    head_coach_name
  )
  select
    t.organization_id,
    t.id,
    v_new_season_id,
    coalesce(
      nullif(trim(previous_ts.display_name), ''),
      t.name
    ),
    coalesce(
      nullif(trim(previous_ts.division), ''),
      t.division
    ),
    null,
    null
  from public.teams t
  left join lateral (
    select
      ts.display_name,
      ts.division
    from public.team_seasons ts
    join public.seasons s
      on s.id = ts.season_id
    where ts.team_id = t.id
      and ts.organization_id = p_organization_id
      and ts.season_id <> v_new_season_id
    order by s.start_date desc
    limit 1
  ) previous_ts on true
  where t.organization_id = p_organization_id
    and t.is_opponent = false
  on conflict (team_id, season_id) do nothing;

  if p_copy_rosters then
    insert into public.players (
      athlete_id,
      name,
      jersey_number,
      position,
      team_id,
      organization_id,
      team_season_id
    )
    select
      p.athlete_id,
      p.name,
      p.jersey_number,
      p.position,
      new_ts.team_id,
      p_organization_id,
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

commit;
