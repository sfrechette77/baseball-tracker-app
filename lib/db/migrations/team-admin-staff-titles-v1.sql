begin;

alter table public.team_admins
  add column if not exists staff_title text;

-- Normalize accidental blank values before enforcing the constraint.
update public.team_admins
set staff_title = null
where staff_title is not null
  and btrim(staff_title) = '';

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_admins_staff_title_valid'
      and conrelid = 'public.team_admins'::regclass
  ) then
    alter table public.team_admins
      add constraint team_admins_staff_title_valid
      check (
        staff_title is null
        or (
          btrim(staff_title) <> ''
          and char_length(btrim(staff_title)) <= 80
        )
      );
  end if;
end;
$block$;

comment on column public.team_admins.staff_title is
  'Optional organization-facing title for this team assignment, such as Head Coach, Assistant Coach, Team Manager, or Scorekeeper. Authorization remains controlled by the team_admin membership and assignment.';

commit;
