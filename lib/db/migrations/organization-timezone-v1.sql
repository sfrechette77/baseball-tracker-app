-- Add an explicit IANA timezone to each organization.
-- Future organization provisioning must supply this value; there is intentionally
-- no database default.

begin;

alter table public.organizations
  add column timezone text;

update public.organizations
set timezone = 'America/Chicago'
where slug in (
  'chicago-elite',
  'diamond-warriors'
);

update public.organizations
set timezone = 'America/New_York'
where slug = 'florida-vandals';

-- Fail rather than silently assigning a timezone to an unexpected organization.
do $$
begin
  if exists (
    select 1
    from public.organizations
    where timezone is null
  ) then
    raise exception 'One or more organizations require an explicit timezone';
  end if;
end
$$;

alter table public.organizations
  alter column timezone set not null;

alter table public.organizations
  add constraint organizations_timezone_not_blank
  check (btrim(timezone) <> '');

comment on column public.organizations.timezone is
  'IANA timezone used for organization-local dates and times, e.g. America/Chicago';

commit;
