begin;

drop policy if exists
  "any authenticated user can create an org"
  on public.organizations;

create or replace function public.bootstrap_organization(
  p_name text,
  p_slug text,
  p_timezone text,
  p_team_names text[]
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
  v_organization_id uuid;
  v_membership_id uuid;
  v_slug text;
  v_team_name text;
  v_team_count integer := 0;
  v_email text;
  v_full_name text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1
    from public.memberships membership
    where membership.user_id = v_user_id
  ) then
    raise exception 'Your account is already linked to an organization';
  end if;

  select
    auth_user.email,
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
    )
  into
    v_email,
    v_full_name
  from auth.users auth_user
  where auth_user.id = v_user_id;

  if v_email is null then
    raise exception 'Authenticated user record could not be loaded';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name
  )
  values (
    v_user_id,
    v_email,
    v_full_name
  )
  on conflict (id)
  do update set
    email = excluded.email,
    full_name = coalesce(
      excluded.full_name,
      public.profiles.full_name
    );

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organization name is required';
  end if;

  v_slug := lower(trim(p_slug));

  if v_slug is null or length(v_slug) = 0 then
    raise exception 'Organization slug is required';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception
      'Organization slug may contain lowercase letters, numbers, and hyphens only';
  end if;

  if exists (
    select 1
    from public.organizations organization
    where organization.slug = v_slug
  ) then
    raise exception 'Organization URL is already in use';
  end if;

  if not exists (
    select 1
    from pg_timezone_names
    where name = trim(p_timezone)
  ) then
    raise exception 'Invalid organization timezone';
  end if;

  if coalesce(cardinality(p_team_names), 0) = 0 then
    raise exception 'At least one team is required';
  end if;

  if coalesce(cardinality(p_team_names), 0) > 25 then
    raise exception 'No more than 25 teams may be created at once';
  end if;

  if exists (
    select 1
    from unnest(p_team_names) team_name
    where team_name is null
       or length(trim(team_name)) = 0
  ) then
    raise exception 'Team names cannot be blank';
  end if;

  if exists (
    select 1
    from (
      select lower(trim(team_name)) as normalized_name
      from unnest(p_team_names) team_name
      group by lower(trim(team_name))
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Team names must be unique';
  end if;

  insert into public.organizations (
    name,
    slug,
    timezone
  )
  values (
    trim(p_name),
    v_slug,
    trim(p_timezone)
  )
  returning id
  into v_organization_id;

  insert into public.memberships (
    user_id,
    organization_id,
    role,
    status,
    approved_by,
    approved_at
  )
  values (
    v_user_id,
    v_organization_id,
    'org_admin',
    'approved',
    v_user_id,
    now()
  )
  returning id
  into v_membership_id;

  foreach v_team_name in array p_team_names
  loop
    insert into public.teams (
      organization_id,
      name,
      is_opponent
    )
    values (
      v_organization_id,
      trim(v_team_name),
      false
    );

    v_team_count := v_team_count + 1;
  end loop;

  return query
  select
    v_organization_id,
    v_membership_id,
    v_team_count;
end;
$function$;

revoke all on function public.bootstrap_organization(
  text,
  text,
  text,
  text[]
) from public;

grant execute on function public.bootstrap_organization(
  text,
  text,
  text,
  text[]
) to authenticated;

commit;
