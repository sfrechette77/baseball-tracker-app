# On Deck — Database Schema

**Last updated:** End of realtime-reactions + mute UI + Chunk H session
**Environment:** Production (`fjrtcxfqculymgyfrato`)
**Status:** Reflects current production state. Most RLS still dormant until cutover.

---

## Overview

The schema supports a multi-tenant SaaS for youth baseball organizations. Top-level tenant is `organizations`. Users belong to orgs via `memberships` (one row per role per user-org pair). Per-season data is scoped through `team_seasons` (Pattern C — permanent teams, per-season instances). Row Level Security (RLS) is enabled selectively (see RLS state section below).

---

## Current RLS state

RLS is enabled on these tables:
- `profiles` (pre-existing)
- `push_subscriptions` (pre-existing)
- `team_posts` (built with RLS from day one)
- `team_post_reactions` (built with RLS from day one)
- `team_messages` (built with RLS from day one — chat v1)
- `team_message_reactions` (built with RLS from day one — chat v1)

RLS is **disabled** on all other tenant tables:
- organizations, seasons, memberships, teams, team_seasons, team_admins, parent_teams
- players, events, fields, league_games, standings, box_scores, player_stats
- game_status_log, event_imports, weather_forecasts

RLS policies exist on all of these (dormant) — created in Chunk 8 but RLS itself is OFF on the tables. At cutover, RLS will be enabled and the policies will take effect.

`computed_standings` is a VIEW, not a table — no RLS state to track.

---

## Enums

### membership_role
Used by `memberships.role`.
- `org_admin`
- `team_admin`
- `parent`

### membership_status
Used by `memberships.status`.
- `pending`
- `approved`
- `rejected`

---

## Helper functions

All helpers use `SECURITY DEFINER` to bypass RLS when checking permissions internally. `STABLE` for query optimization. `search_path` locked to `public, auth`.

### current_user_org_ids()
**Returns:** `SETOF uuid` — list of org IDs the current user has approved membership in.

### is_org_admin(org_id uuid)
**Returns:** `boolean` — true if current user is an approved org_admin of the given org.

### can_admin_team(target_team_id uuid)
**Returns:** `boolean` — true if user is either an org_admin of the team's org, or a team_admin assigned to that team.

### can_admin_team_season(target_team_season_id uuid)
**Returns:** `boolean` — composes `can_admin_team` by looking up the team from the team_season.

### can_read_team(target_team_id uuid)
**Returns:** `boolean` — true if user is an org_admin of the team's org, a team_admin assigned to that team, or a parent linked to the team via parent_teams. All checks require approved membership status.

**NOTE (dev):** this function was created during Feed v1 build but only in prod. Had to be created in dev separately during Chat v1 work. The chat-v1.sql migration file includes a defensive `create or replace function` for it.

---

## Tables — Control Plane

### organizations
Top-level tenant. Each org is one customer.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| slug | text | NOT NULL, UNIQUE | URL slug (e.g. "chicago-elite") |
| name | text | NOT NULL | Display name |
| plan | text | NOT NULL, default 'free' | Subscription tier |
| primary_color | text | nullable | Hex code |
| secondary_color | text | nullable | Hex code |
| logo_url | text | nullable | Points to Supabase Storage |
| has_league_features | boolean | NOT NULL, default false | Feature flag |
| created_by | uuid | FK auth.users, ON DELETE SET NULL | Audit |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `idx_organizations_slug` on slug

**RLS Policies (DORMANT):**
- SELECT: members can read their orgs
- INSERT: any authenticated user can create
- UPDATE: org_admins only
- DELETE: org_admins only

---

### seasons
Per-org season definitions (e.g., "Spring 2026").

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, FK organizations, ON DELETE CASCADE | |
| name | text | NOT NULL | "Spring 2026" |
| start_date | date | NOT NULL | |
| end_date | date | NOT NULL | |
| is_current | boolean | NOT NULL, default false | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `seasons_dates_valid` CHECK (end_date >= start_date)

**Indexes:**
- `idx_seasons_org` on organization_id
- `idx_seasons_one_current_per_org` partial UNIQUE on (organization_id) WHERE is_current = true

**RLS Policies (DORMANT):**
- SELECT: members can read seasons in their orgs
- INSERT/UPDATE/DELETE: org_admins only

---

### memberships
Links users to orgs with a role + status. One row per (user, org, role) combination.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| user_id | uuid | NOT NULL | **No FK to auth.users in dev (test relaxation); FK present in prod** |
| organization_id | uuid | NOT NULL, FK organizations, ON DELETE CASCADE | |
| role | membership_role | NOT NULL | |
| status | membership_status | NOT NULL, default 'pending' | |
| invited_by | uuid | FK auth.users, ON DELETE SET NULL | Audit |
| approved_by | uuid | FK auth.users, ON DELETE SET NULL | Audit. NOT dropped in dev — fake test UUIDs can't be used for this column. |
| approved_at | timestamptz | nullable | |
| **muted_chats** | **uuid[]** | **NOT NULL, default array[]::uuid[]** | **Array of team_ids whose chat the user has muted (chat v1)** |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `memberships_unique_role_per_user_org` UNIQUE (user_id, organization_id, role)

**Indexes:**
- `idx_memberships_user` on user_id
- `idx_memberships_org` on organization_id
- `idx_memberships_org_status` on (organization_id, status)

**RLS Policies (DORMANT):**
- SELECT: users can read own memberships OR org_admins can read all in their org
- INSERT: users can create own pending membership; org_admins can insert memberships in their org
- UPDATE: org_admins can update memberships in their org
- DELETE: org_admins can delete memberships in their org

---

### profiles
User profile data. References Supabase Auth users.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, FK auth.users | One profile per auth user |
| email | text | nullable | |
| full_name | text | nullable | |
| phone | text | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**RLS state:** ON

**RLS Policies (ACTIVE):**
- SELECT: users can read own profile OR org_admins can read profiles of org members
- UPDATE: users can update own profile only
- No INSERT/DELETE policies (managed by Supabase Auth lifecycle)

**Note on signup flow:** Chunk H's signup-complete page upserts profiles using Google-provided metadata (full_name from user_metadata.full_name or .name fields, email from auth.users.email).

---

## Tables — Season Scoping

### team_seasons
Per-season instance of a team. "Moore + Spring 2026" is one row.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, FK organizations, ON DELETE CASCADE | |
| team_id | uuid | NOT NULL, FK teams, ON DELETE CASCADE | |
| season_id | uuid | NOT NULL, FK seasons, ON DELETE CASCADE | |
| age_group | text | nullable | "11U", "12U", etc. |
| head_coach_name | text | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `team_seasons_unique` UNIQUE (team_id, season_id)

**Indexes:**
- `idx_team_seasons_org` on organization_id
- `idx_team_seasons_team` on team_id
- `idx_team_seasons_season` on season_id

**RLS Policies (DORMANT):**
- SELECT: members can read team_seasons in their orgs
- INSERT/UPDATE/DELETE: org_admins only

---

## Tables — Role Scoping

### team_admins
Links team_admin memberships to specific teams.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| membership_id | uuid | NOT NULL, FK memberships, ON DELETE CASCADE | |
| team_id | uuid | NOT NULL, FK teams, ON DELETE CASCADE | |
| created_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `team_admins_unique` UNIQUE (membership_id, team_id)

**Indexes:**
- `idx_team_admins_membership` on membership_id
- `idx_team_admins_team` on team_id

**RLS Policies (DORMANT):**
- SELECT: users can read own team_admin assignments OR org_admins can read all in their org
- INSERT/UPDATE/DELETE: org_admins of the membership's org

---

### parent_teams
Links parent memberships to teams (their kids' teams).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| membership_id | uuid | NOT NULL, FK memberships, ON DELETE CASCADE | |
| team_id | uuid | NOT NULL, FK teams, ON DELETE CASCADE | |
| is_default | boolean | NOT NULL, default false | Used for landing page |
| created_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `parent_teams_unique` UNIQUE (membership_id, team_id)

**Indexes:**
- `idx_parent_teams_membership` on membership_id
- `idx_parent_teams_team` on team_id
- `idx_parent_teams_one_default` partial UNIQUE on (membership_id) WHERE is_default = true

**RLS Policies (DORMANT):**
- SELECT: users can read own parent_team assignments OR org_admins can read all in their org
- INSERT/UPDATE/DELETE: org_admins of the membership's org

**Write pattern in Chunk H:** approveMembership inserts rows here when an admin approves a pending parent. Always inserts as a batch, with exactly one row having is_default=true.

---

## Tables — Tenant Data (Org-Scoped)

All tables in this section have `organization_id` NOT NULL with default Chicago Elite UUID (`75c11f73-5394-4ffc-bf39-9c708418e07b`), FK organizations, ON DELETE CASCADE, indexed via `idx_<tablename>_org`. RLS policies exist but RLS itself is OFF (dormant until cutover) unless noted otherwise.

### teams
Permanent team identity.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| organization_id | uuid | NOT NULL, FK organizations | |
| name | text | NOT NULL | "Moore" |
| sport | text | NOT NULL, default 'baseball' | |
| division | text | nullable | |
| arrival_buffer_minutes | integer | NOT NULL, default 45 | |
| owner_user_id | uuid | nullable | Legacy field |
| created_at | timestamptz | NOT NULL, default now() | |

**RLS Policies (DORMANT):**
- SELECT: members can read teams in their orgs
- INSERT/UPDATE/DELETE: org_admins only

---

### players, events, fields, league_games, standings, box_scores, player_stats, game_status_log, event_imports, weather_forecasts

(Unchanged from prior version. All have organization_id NOT NULL with default Chicago Elite UUID, FK organizations, ON DELETE CASCADE. RLS DORMANT.)

**Per-season tables** (players, events, box_scores, player_stats, league_games, standings) link via `team_season_id` to team_seasons. Old `team_id` columns DROPPED in Chunk 3 except on standings, which kept its team_name column.

---

### computed_standings (VIEW)
Aggregated standings view. Rewritten in Chunk 6 to expose `organization_id`. Views don't have their own RLS; access is controlled by RLS on underlying tables.

---

### push_subscriptions
Web Push notification subscriptions tied to a team. **Updated for mute UI:** added `membership_id` column.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, FK organizations | |
| team_id | uuid | NOT NULL | |
| **membership_id** | **uuid** | **nullable, FK memberships, ON DELETE CASCADE** | **Added during mute UI work. Links subscription to a membership so push helper can check muted_chats.** |
| endpoint | text | NOT NULL | Web Push endpoint URL |
| p256dh | text | NOT NULL | Push encryption key |
| auth | text | NOT NULL | Push auth secret |
| user_agent | text | nullable | |
| last_pushed_at | timestamptz | nullable | |
| created_at | timestamptz | default now() | |

**Indexes:**
- `idx_push_subscriptions_membership` on membership_id

**RLS state:** ON

**RLS Policies (ACTIVE):**
- SELECT: members can read push_subscriptions in their orgs
- INSERT/UPDATE/DELETE: any approved member of the org (permissive; refine when revisiting push flow)

**Note on legacy rows:** Subscriptions created before the membership_id migration have membership_id=null. The `sendPushToTeam` helper treats null as "no mute info, send anyway" — graceful degradation. To get mute working on a legacy device, unsubscribe + re-subscribe in the app (one-time).

---

## Tables — Feed Feature

### team_posts
Admin announcements with optional images.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, default Chicago Elite UUID, FK organizations | |
| team_id | uuid | NOT NULL, FK teams, ON DELETE CASCADE | |
| author_membership_id | uuid | NOT NULL, FK memberships, ON DELETE RESTRICT | |
| body | text | NOT NULL | The post content |
| image_url | text | nullable | Signed URL for image |
| image_path | text | nullable | Storage path for cleanup |
| deleted_at | timestamptz | nullable | Soft delete |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:**
- `idx_team_posts_org`, `idx_team_posts_team`, `idx_team_posts_author`
- `idx_team_posts_team_created` partial on (team_id, created_at desc) WHERE deleted_at is null

**RLS state:** ON

**RLS Policies (ACTIVE):**
- SELECT: `can_read_team(team_id) AND (deleted_at IS NULL OR can_admin_team(team_id))`
- INSERT: `can_admin_team(team_id)` AND author must be the current user's approved membership
- UPDATE: `can_admin_team(team_id)`
- DELETE: `can_admin_team(team_id)`

**App layer note:** getFeed adds `.is('deleted_at', null)` to filter soft-deleted posts from non-admin views.

---

### team_post_reactions
Emoji reactions to posts.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, default Chicago Elite UUID, FK organizations | |
| post_id | uuid | NOT NULL, FK team_posts, ON DELETE CASCADE | |
| membership_id | uuid | NOT NULL, FK memberships, ON DELETE CASCADE | |
| emoji | text | NOT NULL | One of: 👍 ❤️ 🎉 ⚾ 🔥 |
| created_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `team_post_reactions_unique` UNIQUE (post_id, membership_id, emoji)

**RLS state:** ON

**RLS Policies (ACTIVE):**
- SELECT: if you can read the parent post, you can see its reactions
- INSERT: you can read the post AND the reaction's membership must be your own approved membership
- DELETE: you can delete reactions that belong to your own membership
- No UPDATE policy — reactions are insert/delete only

---

## Tables — Chat Feature (v1)

### team_messages
Realtime chat messages. Anyone with an approved membership in a team's org who has access to that team (org_admin / team_admin / parent_teams) can post.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, default Chicago Elite UUID, FK organizations, ON DELETE CASCADE | |
| team_id | uuid | NOT NULL, FK teams, ON DELETE CASCADE | Pinned to permanent team |
| author_membership_id | uuid | NOT NULL, FK memberships, ON DELETE RESTRICT | |
| body | text | NOT NULL | Message content (can be empty string if image only) |
| image_url | text | nullable | Signed URL for image |
| image_path | text | nullable | Storage path for cleanup |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**No soft delete.** Hard delete only.

**Indexes:**
- `idx_team_messages_org`, `idx_team_messages_team`, `idx_team_messages_author`
- `idx_team_messages_team_created` on (team_id, created_at desc)

**RLS state:** ON

**RLS Policies (ACTIVE):**
- SELECT: `can_read_team(team_id)`
- INSERT: `can_read_team(team_id)` AND author_membership_id must be the current user's approved membership
- UPDATE: only the author can edit their own message (no UI in v1)
- DELETE: only the author can delete their own message

**Realtime:** added to `supabase_realtime` publication. Clients subscribe via `supabase.channel('team_messages:...').on('postgres_changes', { event: 'INSERT' | 'DELETE', filter: 'team_id=eq.XXX' }, ...)`.

---

### team_message_reactions
Emoji reactions to chat messages.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, default Chicago Elite UUID, FK organizations, ON DELETE CASCADE | |
| message_id | uuid | NOT NULL, FK team_messages, ON DELETE CASCADE | |
| membership_id | uuid | NOT NULL, FK memberships, ON DELETE CASCADE | |
| emoji | text | NOT NULL | One of: 👍 ❤️ 🎉 ⚾ 🔥 |
| created_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `team_message_reactions_unique` UNIQUE (message_id, membership_id, emoji)

**RLS state:** ON

**RLS Policies (ACTIVE):**
- SELECT: if you can read the parent message's team via `can_read_team`, you can see its reactions
- INSERT: can read the message AND reaction's membership must be your own approved membership
- DELETE: can only delete reactions that belong to your own membership
- No UPDATE policy

**Realtime (updated):** added to publication. Client now subscribes to INSERT/DELETE events globally (no team_id filter possible — table has no team_id column). UI refetch is debounced (2 seconds) to prevent spam when multiple users react in succession.

**Future scaling note:** at very large scale, the global subscription becomes inefficient. Adding a `team_id` column and filter would localize realtime traffic.

---

## Supabase Storage

### team-posts bucket
Stores post images for the Feed feature.

**Configuration:**
- Name: `team-posts`
- Public: false (gated via signed URLs)
- File size limit: 5MB
- Allowed MIME types: image/jpeg, image/png, image/webp, image/heic
- Path structure: `{organization_id}/{team_id}/{post_id}.{ext}`

**RLS Policies on storage.objects (scoped to bucket_id = 'team-posts'):**
- INSERT: team_admins/org_admins can upload via `can_admin_team((storage.foldername(name))[2]::uuid)`
- SELECT: members who can read team content can view via `can_read_team`
- UPDATE: team_admins/org_admins can replace images
- DELETE: team_admins/org_admins can delete images

---

### team-messages bucket (chat v1)
Stores message images for the Chat feature.

**Configuration:**
- Name: `team-messages`
- Public: false (gated via signed URLs)
- File size limit: 5MB
- Allowed MIME types: image/jpeg, image/png, image/webp, image/heic
- Path structure: `{organization_id}/{team_id}/{message_id}.{ext}`

**RLS Policies on storage.objects (scoped to bucket_id = 'team-messages'):**
- INSERT: anyone who `can_read_team` for path[2] can upload (everyone in chat can post)
- SELECT: same scope
- UPDATE: same scope
- DELETE: same scope (controlled at app layer to restrict to authors; chat RLS only allows authors to delete the message row itself)

---

## Realtime publication

`supabase_realtime` publication includes:
- `team_messages` — for live chat updates (INSERT/DELETE)
- `team_message_reactions` — for live reaction updates (INSERT/DELETE), debounced client-side

To enable, ran:
```sql
alter publication supabase_realtime add table public.team_messages;
alter publication supabase_realtime add table public.team_message_reactions;
```

---

## RLS pattern summary

When RLS is enabled:

**Read pattern (SELECT):**
Approved members can read all data in their orgs. Cross-team visibility within an org is allowed.

**Write pattern — Org-wide (org_admin only):**
teams, fields, league_games, standings, event_imports, weather_forecasts, team_seasons, seasons, game_status_log

**Write pattern — Team-scoped (team_admin OR org_admin):**
players, events, box_scores, player_stats, team_posts, team_post_reactions

**Write pattern — Open-to-team-members:**
team_messages, team_message_reactions (anyone in the team's org with access to the team can write)

**Write pattern — Self-managed:**
profiles (own row only), memberships (own pending row on insert; org_admins can update others), team_messages delete (author only), team_message_reactions delete (own only)

---

## Migration files in repo

- `lib/db/migrations/chat-v1.sql` — Chat v1 schema, RLS, Realtime publication, Storage policies. **Already RUN against dev AND prod.**

**Other migrations run ad-hoc and not yet saved to repo:**
- Mute UI: added `push_subscriptions.membership_id` column (nullable FK to memberships, ON DELETE CASCADE), with `idx_push_subscriptions_membership` index. Run against dev and prod.
- Test harness: User D profile backfilled (`44444444-4444-4444-4444-444444444444` → "Daniel Davis", userd@example.com).
- Test harness: User C linked to Moore via parent_teams (during chat RLS testing).

---

## Dropped / removed

- `team_members` table (deprecated, was empty)
- `org_role` enum (production-only orphan)
- `organizations` table's old version (Frechette Baseball row)
- `org_members` table (orphaned scaffolding)
- `teams.season_label` column
- `players.team_id`, `events.team_id`, `box_scores.team_id`
- `league_games.home_team_id`, `league_games.away_team_id`
- `standings.team_name`

---

## Outstanding items before cutover

1. **Drop redundant `team_id` columns** from per-season tables (Approach A still has them; Chunk 4b will drop them).
2. **Enable RLS on tenant tables** — 17 tables currently have RLS off. This is the cutover.
3. **Decide on `memberships.user_id` FK to `auth.users(id)`** — present in prod, dropped in dev for test harness. Document or restore.
4. **Decide on `memberships.approved_by` FK** — present in both prod and dev. Causes test friction in dev (fake UUIDs can't be used for this column). Either drop in dev or always omit in dev tests.

---

## Notes for production migration (historical)

Production has data. Several Chunk 3 operations were destructive and required a different sequence than dev:

1. Add team_season_id columns (nullable)
2. Create team_seasons rows for every existing team in the current season
3. Backfill team_season_id from existing team_id values
4. Verify backfill is complete
5. Then drop team_id columns

Production also had:
- Pre-existing primary keys on all tables (skipped the PK-add step from dev)
- Orphaned `organizations` table — dropped before recreating
- Orphaned `org_members` table — dropped before recreating
- The `org_role` enum — dropped before creating `membership_role`
- `computed_standings` is populated by a VIEW (no triggers/jobs)