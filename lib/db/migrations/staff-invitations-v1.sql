begin;

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  staff_title text,
  invited_by uuid
    references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_by uuid
    references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid
    references auth.users(id) on delete set null,
  revoked_at timestamptz,
  send_count integer not null default 0,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_invitations_email_normalized
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 320
      and position('@' in email) > 1
    ),

  constraint staff_invitations_token_hash_valid
    check (token_hash ~ '^[0-9a-f]{64}$'),

  constraint staff_invitations_staff_title_valid
    check (
      staff_title is null
      or (
        btrim(staff_title) <> ''
        and char_length(btrim(staff_title)) <= 80
      )
    ),

  constraint staff_invitations_expiration_valid
    check (expires_at > created_at),

  constraint staff_invitations_acceptance_valid
    check (
      (accepted_at is null and accepted_by is null)
      or
      (accepted_at is not null and accepted_by is not null)
    ),

  constraint staff_invitations_revocation_valid
    check (
      (revoked_at is null and revoked_by is null)
      or
      (revoked_at is not null and revoked_by is not null)
    ),

  constraint staff_invitations_terminal_state_valid
    check (
      accepted_at is null
      or revoked_at is null
    ),

  constraint staff_invitations_send_count_valid
    check (send_count >= 0)
);

create table public.staff_invitation_teams (
  invitation_id uuid not null
    references public.staff_invitations(id) on delete cascade,
  team_id uuid not null
    references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (invitation_id, team_id)
);

create index idx_staff_invitations_org
  on public.staff_invitations(organization_id);

create index idx_staff_invitations_expires
  on public.staff_invitations(expires_at);

create unique index idx_staff_invitations_open_email
  on public.staff_invitations(
    organization_id,
    lower(email)
  )
  where accepted_at is null
    and revoked_at is null;

create index idx_staff_invitation_teams_team
  on public.staff_invitation_teams(team_id);

alter table public.staff_invitations
  enable row level security;

alter table public.staff_invitation_teams
  enable row level security;

create policy "staff invitations org admins can read"
  on public.staff_invitations
  for select
  to authenticated
  using (
    public.is_org_admin(organization_id)
  );

create policy "staff invitations org admins can insert"
  on public.staff_invitations
  for insert
  to authenticated
  with check (
    public.is_org_admin(organization_id)
  );

create policy "staff invitations org admins can update"
  on public.staff_invitations
  for update
  to authenticated
  using (
    public.is_org_admin(organization_id)
  )
  with check (
    public.is_org_admin(organization_id)
  );

create policy "staff invitations org admins can delete"
  on public.staff_invitations
  for delete
  to authenticated
  using (
    public.is_org_admin(organization_id)
  );

create policy "staff invitation teams org admins can read"
  on public.staff_invitation_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_invitations invitation
      where invitation.id = invitation_id
        and public.is_org_admin(invitation.organization_id)
    )
  );

create policy "staff invitation teams org admins can insert"
  on public.staff_invitation_teams
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.staff_invitations invitation
      join public.teams team
        on team.id = team_id
       and team.organization_id = invitation.organization_id
       and team.is_opponent = false
      where invitation.id = invitation_id
        and public.is_org_admin(invitation.organization_id)
    )
  );

create policy "staff invitation teams org admins can delete"
  on public.staff_invitation_teams
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.staff_invitations invitation
      where invitation.id = invitation_id
        and public.is_org_admin(invitation.organization_id)
    )
  );

comment on table public.staff_invitations is
  'Organization staff invitations. Only a SHA-256 hash of the bearer invitation token is stored.';

comment on table public.staff_invitation_teams is
  'Teams that will be assigned when a staff invitation is accepted.';

create or replace function public.accept_staff_invitation(
  p_token_hash text
)
returns table (
  result_organization_id uuid,
  result_membership_id uuid,
  result_team_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_user_id uuid;
  v_user_email text;
  v_full_name text;
  v_invitation public.staff_invitations%rowtype;
  v_membership_id uuid;
  v_team_count integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation token';
  end if;

  select
    lower(trim(auth_user.email)),
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
    )
  into
    v_user_email,
    v_full_name
  from auth.users auth_user
  where auth_user.id = v_user_id;

  if v_user_email is null then
    raise exception 'Authenticated user email could not be loaded';
  end if;

  select invitation.*
  into v_invitation
  from public.staff_invitations invitation
  where invitation.token_hash = lower(trim(p_token_hash))
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_invitation.accepted_at is not null then
    raise exception 'Invitation has already been accepted';
  end if;

  if v_invitation.revoked_at is not null then
    raise exception 'Invitation has been revoked';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'Invitation has expired';
  end if;

  if v_user_email <> v_invitation.email then
    raise exception 'Sign in with the email address that received this invitation';
  end if;

  if not exists (
    select 1
    from public.staff_invitation_teams invitation_team
    where invitation_team.invitation_id = v_invitation.id
  ) then
    raise exception 'Invitation has no team assignments';
  end if;

  if exists (
    select 1
    from public.staff_invitation_teams invitation_team
    left join public.teams team
      on team.id = invitation_team.team_id
     and team.organization_id = v_invitation.organization_id
     and team.is_opponent = false
    where invitation_team.invitation_id = v_invitation.id
      and team.id is null
  ) then
    raise exception 'Invitation contains an invalid team assignment';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name
  )
  values (
    v_user_id,
    v_user_email,
    v_full_name
  )
  on conflict (id)
  do update set
    email = excluded.email,
    full_name = coalesce(
      excluded.full_name,
      public.profiles.full_name
    );

  insert into public.memberships (
    user_id,
    organization_id,
    role,
    status,
    invited_by,
    approved_by,
    approved_at
  )
  values (
    v_user_id,
    v_invitation.organization_id,
    'team_admin',
    'approved',
    v_invitation.invited_by,
    v_invitation.invited_by,
    now()
  )
  on conflict (user_id, organization_id, role)
  do update set
    status = 'approved',
    invited_by = excluded.invited_by,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    updated_at = now()
  returning id
  into v_membership_id;

  insert into public.team_admins (
    membership_id,
    team_id,
    staff_title
  )
  select
    v_membership_id,
    invitation_team.team_id,
    v_invitation.staff_title
  from public.staff_invitation_teams invitation_team
  join public.teams team
    on team.id = invitation_team.team_id
   and team.organization_id = v_invitation.organization_id
   and team.is_opponent = false
  where invitation_team.invitation_id = v_invitation.id
  on conflict (membership_id, team_id)
  do update set
    staff_title = excluded.staff_title;

  get diagnostics v_team_count = row_count;

  update public.staff_invitations
  set
    accepted_by = v_user_id,
    accepted_at = now(),
    updated_at = now()
  where id = v_invitation.id;

  return query
  select
    v_invitation.organization_id,
    v_membership_id,
    v_team_count;
end;
$function$;

revoke all on function public.accept_staff_invitation(text)
  from public;

revoke all on function public.accept_staff_invitation(text)
  from anon;

grant execute on function public.accept_staff_invitation(text)
  to authenticated;

commit;
