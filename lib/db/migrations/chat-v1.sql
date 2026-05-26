-- ============================================================
-- Chat v1 — Schema Migration
--
-- Creates the team_messages + team_message_reactions tables,
-- their RLS policies, the muted_chats column on memberships,
-- enables Realtime, and creates the team-messages Storage bucket
-- with its RLS policies.
--
-- Tested in: on-deck-dev
-- Pending: prod cutover (alongside Chunk H signup work)
-- ============================================================

-- ─── PREREQUISITE: helper function ───────────────────────────
-- can_read_team should already exist in prod (created during
-- Feed work). It was missing in dev as of 2026-05-25 — included
-- here defensively in case it's missing in the target environment.

create or replace function public.can_read_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  with team_org as (
    select t.organization_id
    from public.teams t
    where t.id = target_team_id
  )
  select exists (
    -- org_admin of the team's org
    select 1
    from public.memberships m
    join team_org t on t.organization_id = m.organization_id
    where m.user_id = auth.uid()
      and m.role = 'org_admin'
      and m.status = 'approved'
  )
  or exists (
    -- team_admin assigned to this team
    select 1
    from public.team_admins ta
    join public.memberships m on m.id = ta.membership_id
    where ta.team_id = target_team_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
  )
  or exists (
    -- parent linked to this team
    select 1
    from public.parent_teams pt
    join public.memberships m on m.id = pt.membership_id
    where pt.team_id = target_team_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
  );
$$;

-- ─── 1. team_messages ────────────────────────────────────────
-- NOTE: the organization_id default below references prod's
-- Chicago Elite UUID. In dev we override the default after-the-
-- fact (see end of file). When running in prod, the default works
-- as-is.

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    default '75c11f73-5394-4ffc-bf39-9c708418e07b'::uuid
    references public.organizations(id) on delete cascade,
  team_id uuid not null
    references public.teams(id) on delete cascade,
  author_membership_id uuid not null
    references public.memberships(id) on delete restrict,
  body text not null,
  image_url text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_messages_org
  on public.team_messages(organization_id);

create index if not exists idx_team_messages_team
  on public.team_messages(team_id);

create index if not exists idx_team_messages_author
  on public.team_messages(author_membership_id);

create index if not exists idx_team_messages_team_created
  on public.team_messages(team_id, created_at desc);

-- ─── 2. team_message_reactions ───────────────────────────────

create table if not exists public.team_message_reactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    default '75c11f73-5394-4ffc-bf39-9c708418e07b'::uuid
    references public.organizations(id) on delete cascade,
  message_id uuid not null
    references public.team_messages(id) on delete cascade,
  membership_id uuid not null
    references public.memberships(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),

  constraint team_message_reactions_unique
    unique (message_id, membership_id, emoji)
);

create index if not exists idx_team_message_reactions_org
  on public.team_message_reactions(organization_id);

create index if not exists idx_team_message_reactions_message
  on public.team_message_reactions(message_id);

create index if not exists idx_team_message_reactions_membership
  on public.team_message_reactions(membership_id);

-- ─── 3. memberships.muted_chats ──────────────────────────────
-- Array of team_ids whose chat the user has muted notifications for.
-- Empty array (default) = no mutes.

alter table public.memberships
  add column if not exists muted_chats uuid[] not null default array[]::uuid[];

-- ─── 4. RLS — team_messages ──────────────────────────────────

alter table public.team_messages enable row level security;

drop policy if exists team_messages_select on public.team_messages;
create policy team_messages_select on public.team_messages
  for select to authenticated
  using (public.can_read_team(team_id));

drop policy if exists team_messages_insert on public.team_messages;
create policy team_messages_insert on public.team_messages
  for insert to authenticated
  with check (
    public.can_read_team(team_id)
    and exists (
      select 1
      from public.memberships m
      where m.id = team_messages.author_membership_id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  );

drop policy if exists team_messages_update on public.team_messages;
create policy team_messages_update on public.team_messages
  for update to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.id = team_messages.author_membership_id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  )
  with check (
    exists (
      select 1
      from public.memberships m
      where m.id = team_messages.author_membership_id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  );

drop policy if exists team_messages_delete on public.team_messages;
create policy team_messages_delete on public.team_messages
  for delete to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.id = team_messages.author_membership_id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  );

-- ─── 5. RLS — team_message_reactions ─────────────────────────

alter table public.team_message_reactions enable row level security;

drop policy if exists team_message_reactions_select on public.team_message_reactions;
create policy team_message_reactions_select on public.team_message_reactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.team_messages tm
      where tm.id = team_message_reactions.message_id
        and public.can_read_team(tm.team_id)
    )
  );

drop policy if exists team_message_reactions_insert on public.team_message_reactions;
create policy team_message_reactions_insert on public.team_message_reactions
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.team_messages tm
      where tm.id = team_message_reactions.message_id
        and public.can_read_team(tm.team_id)
    )
    and exists (
      select 1
      from public.memberships m
      where m.id = team_message_reactions.membership_id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  );

drop policy if exists team_message_reactions_delete on public.team_message_reactions;
create policy team_message_reactions_delete on public.team_message_reactions
  for delete to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.id = team_message_reactions.membership_id
        and m.user_id = auth.uid()
        and m.status = 'approved'
    )
  );

-- ─── 6. Realtime publication ─────────────────────────────────

alter publication supabase_realtime add table public.team_messages;
alter publication supabase_realtime add table public.team_message_reactions;

-- ─── 7. Storage bucket RLS ────────────────────────────────────
-- NOTE: bucket itself must be created via Supabase dashboard UI:
--   name: team-messages
--   public: OFF
--   allowed MIME types: image/jpeg, image/png, image/webp, image/heic
--   file size limit: 5 MB

drop policy if exists team_messages_storage_select on storage.objects;
create policy team_messages_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'team-messages'
    and public.can_read_team((storage.foldername(name))[2]::uuid)
  );

drop policy if exists team_messages_storage_insert on storage.objects;
create policy team_messages_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-messages'
    and public.can_read_team((storage.foldername(name))[2]::uuid)
  );

drop policy if exists team_messages_storage_update on storage.objects;
create policy team_messages_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'team-messages'
    and public.can_read_team((storage.foldername(name))[2]::uuid)
  )
  with check (
    bucket_id = 'team-messages'
    and public.can_read_team((storage.foldername(name))[2]::uuid)
  );

drop policy if exists team_messages_storage_delete on storage.objects;
create policy team_messages_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-messages'
    and public.can_read_team((storage.foldername(name))[2]::uuid)
  );

-- ─── 8. DEV ONLY: override default org_id ────────────────────
-- Dev's Chicago Elite has a different UUID than prod's. Skip this
-- section when running in prod.

-- Dev Chicago Elite UUID: 25c71684-dcdb-4ccc-9e8b-4f4357c3b8ee
-- Prod Chicago Elite UUID: 75c11f73-5394-4ffc-bf39-9c708418e07b
--
-- alter table public.team_messages
--   alter column organization_id set default '25c71684-dcdb-4ccc-9e8b-4f4357c3b8ee'::uuid;
-- alter table public.team_message_reactions
--   alter column organization_id set default '25c71684-dcdb-4ccc-9e8b-4f4357c3b8ee'::uuid;

-- ─── End ─────────────────────────────────────────────────────