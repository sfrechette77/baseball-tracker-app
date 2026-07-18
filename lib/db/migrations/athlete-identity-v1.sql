begin;

-- ─── Permanent athlete identities ───────────────────────────────────────────

create table if not exists public.athletes (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  display_name text not null,
  status text default 'active'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint athletes_pkey
    primary key (id),

  constraint athletes_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id),

  constraint athletes_display_name_not_blank
    check (length(trim(display_name)) > 0),

  constraint athletes_status_valid
    check (status in ('active', 'inactive', 'archived')),

  constraint athletes_id_organization_unique
    unique (id, organization_id)
);

create index if not exists idx_athletes_organization
  on public.athletes (organization_id);

create index if not exists idx_athletes_organization_name
  on public.athletes (
    organization_id,
    lower(trim(display_name))
  );


-- ─── Guardian-to-athlete relationships ──────────────────────────────────────

create table if not exists public.guardian_athletes (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  membership_id uuid not null,
  athlete_id uuid not null,
  relationship text,
  is_primary boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  constraint guardian_athletes_pkey
    primary key (id),

  constraint guardian_athletes_unique
    unique (membership_id, athlete_id),

  constraint guardian_athletes_relationship_not_blank
    check (
      relationship is null
      or length(trim(relationship)) > 0
    ),

  constraint guardian_athletes_athlete_org_fkey
    foreign key (athlete_id, organization_id)
    references public.athletes (id, organization_id)
    on delete cascade,

  constraint guardian_athletes_membership_org_fkey
    foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id)
    on delete cascade
);

create index if not exists idx_guardian_athletes_organization
  on public.guardian_athletes (organization_id);

create index if not exists idx_guardian_athletes_membership
  on public.guardian_athletes (membership_id);

create index if not exists idx_guardian_athletes_athlete
  on public.guardian_athletes (athlete_id);


-- ─── Link seasonal player assignments to permanent athletes ────────────────

alter table public.players
  add column if not exists athlete_id uuid;

-- Conservative backfill:
-- create one permanent athlete per existing seasonal player row.
-- Do not merge records solely because their names match.
insert into public.athletes (
  id,
  organization_id,
  display_name
)
select
  player.id,
  player.organization_id,
  trim(player.name)
from public.players player
where player.athlete_id is null
  and player.organization_id is not null
  and length(trim(coalesce(player.name, ''))) > 0
on conflict (id) do nothing;

update public.players player
set athlete_id = player.id
where player.athlete_id is null
  and exists (
    select 1
    from public.athletes athlete
    where athlete.id = player.id
      and athlete.organization_id = player.organization_id
  );

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_athlete_organization_fkey'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_athlete_organization_fkey
      foreign key (athlete_id, organization_id)
      references public.athletes (id, organization_id);
  end if;
end;
$block$;

create index if not exists idx_players_athlete
  on public.players (athlete_id);

create unique index if not exists idx_players_unique_athlete_team_season
  on public.players (athlete_id, team_season_id)
  where athlete_id is not null;


-- ─── Updated-at triggers ─────────────────────────────────────────────────────

do $block$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'athletes_set_updated_at'
      and tgrelid = 'public.athletes'::regclass
      and not tgisinternal
  ) then
    execute '
      create trigger athletes_set_updated_at
      before update on public.athletes
      for each row
      execute function public.set_row_updated_at()
    ';
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'guardian_athletes_set_updated_at'
      and tgrelid = 'public.guardian_athletes'::regclass
      and not tgisinternal
  ) then
    execute '
      create trigger guardian_athletes_set_updated_at
      before update on public.guardian_athletes
      for each row
      execute function public.set_row_updated_at()
    ';
  end if;
end;
$block$;


-- ─── Row-level security ──────────────────────────────────────────────────────

alter table public.athletes enable row level security;
alter table public.guardian_athletes enable row level security;


-- Athletes

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'athletes'
      and policyname = 'members can read athletes'
  ) then
    execute '
      create policy "members can read athletes"
      on public.athletes
      for select
      using (
        organization_id in (
          select public.current_user_org_ids()
        )
      )
    ';
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'athletes'
      and policyname = 'org admins can insert athletes'
  ) then
    execute '
      create policy "org admins can insert athletes"
      on public.athletes
      for insert
      with check (
        public.is_org_admin(organization_id)
      )
    ';
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'athletes'
      and policyname = 'org admins can update athletes'
  ) then
    execute '
      create policy "org admins can update athletes"
      on public.athletes
      for update
      using (
        public.is_org_admin(organization_id)
      )
      with check (
        public.is_org_admin(organization_id)
      )
    ';
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'athletes'
      and policyname = 'org admins can delete athletes'
  ) then
    execute '
      create policy "org admins can delete athletes"
      on public.athletes
      for delete
      using (
        public.is_org_admin(organization_id)
      )
    ';
  end if;
end;
$block$;


-- Guardian-athlete relationships

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'guardian_athletes'
      and policyname = 'guardians read own athlete relationships or admins'
  ) then
    execute '
      create policy "guardians read own athlete relationships or admins"
      on public.guardian_athletes
      for select
      using (
        exists (
          select 1
          from public.memberships membership
          where membership.id = guardian_athletes.membership_id
            and membership.user_id = auth.uid()
        )
        or public.is_org_admin(organization_id)
      )
    ';
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'guardian_athletes'
      and policyname = 'org admins can insert guardian athlete relationships'
  ) then
    execute '
      create policy "org admins can insert guardian athlete relationships"
      on public.guardian_athletes
      for insert
      with check (
        public.is_org_admin(organization_id)
      )
    ';
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'guardian_athletes'
      and policyname = 'org admins can update guardian athlete relationships'
  ) then
    execute '
      create policy "org admins can update guardian athlete relationships"
      on public.guardian_athletes
      for update
      using (
        public.is_org_admin(organization_id)
      )
      with check (
        public.is_org_admin(organization_id)
      )
    ';
  end if;
end;
$block$;

do $block$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'guardian_athletes'
      and policyname = 'org admins can delete guardian athlete relationships'
  ) then
    execute '
      create policy "org admins can delete guardian athlete relationships"
      on public.guardian_athletes
      for delete
      using (
        public.is_org_admin(organization_id)
      )
    ';
  end if;
end;
$block$;


-- Match Supabase table grants. RLS remains the authorization boundary.

grant all on table public.athletes
  to anon, authenticated, service_role;

grant all on table public.guardian_athletes
  to anon, authenticated, service_role;

commit;
