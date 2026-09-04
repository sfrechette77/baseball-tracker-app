-- Remove legacy Chicago Elite organization_id defaults.
-- organization_id remains NOT NULL on every table, so writers must now
-- explicitly provide the correct tenant organization.

begin;

alter table public.box_scores
  alter column organization_id drop default;

alter table public.event_imports
  alter column organization_id drop default;

alter table public.events
  alter column organization_id drop default;

alter table public.fields
  alter column organization_id drop default;

alter table public.game_status_log
  alter column organization_id drop default;

alter table public.league_games
  alter column organization_id drop default;

alter table public.push_subscriptions
  alter column organization_id drop default;

alter table public.standings
  alter column organization_id drop default;

alter table public.team_message_reactions
  alter column organization_id drop default;

alter table public.team_messages
  alter column organization_id drop default;

alter table public.team_post_reactions
  alter column organization_id drop default;

alter table public.team_posts
  alter column organization_id drop default;

alter table public.teams
  alter column organization_id drop default;

alter table public.weather_forecasts
  alter column organization_id drop default;

commit;
