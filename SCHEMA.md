# On Deck — Database Schema

**Last updated:** End of Members-UI + signup-fix session
**Environment:** Production (`fjrtcxfqculymgyfrato`)
**Status:** **RLS is now ON for all 17 tenant tables.** Multi-tenancy is enforced at the database layer. Chunk 4b complete (`fields.team_id` dropped). Pre-auth routes use a service-role client.

---

## Overview

The schema supports a multi-tenant SaaS for youth baseball organizations. Top-level tenant is `organizations`. Users belong to orgs via `memberships` (one row per role per user-org pair). Per-season data is scoped through `team_seasons` (Pattern C — permanent teams, per-season instances). Row Level Security (RLS) is now enabled on every tenant table.

---

## Current RLS state

**RLS is ON for all tenant tables.** The cutover happened in 4 batches:

| Batch | Tables |
|---|---|
| Batch 1 | fields, weather_forecasts, event_imports, game_status_log |
| Batch 2 | teams, team_seasons, players, events |
| Batch 3 | box_scores, player_stats, league_games, standings |
| Batch 4 | organizations, seasons, team_admins, parent_teams, memberships |

Plus the always-RLS tables that were never dormant:
- `profiles`
- `push_subscriptions`
- `team_posts`, `team_post_reactions`
- `team_messages`, `team_message_reactions`

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

**Critical insight from cutover:** SECURITY DEFINER is what makes `memberships` RLS safe. The helpers read membership rows internally with elevated privileges; they don't depend on the caller's RLS-restricted view of the table. If we didn't have SECURITY DEFINER on these, enabling RLS on memberships would break every other policy because they all transitively check membership.

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

**RLS Policies (ACTIVE):**
- SELECT: `id IN current_user_org_ids()` — members can read their orgs
- INSERT: `auth.uid() IS NOT NULL` — any authenticated user can create
- UPDATE: `is_org_admin(id)` — org_admins only
- DELETE: `is_org_admin(id)` — org_admins only

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

**RLS Policies (ACTIVE):**
- SELECT: `organization_id IN current_user_org_ids()`
- INSERT/UPDATE/DELETE: `is_org_admin(organization_id)`

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
| muted_chats | uuid[] | NOT NULL, default array[]::uuid[] | Array of team_ids whose chat the user has muted |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `memberships_unique_role_per_user_org` UNIQUE (user_id, organization_id, role)

**Indexes:**
- `idx_memberships_user` on user_id
- `idx_memberships_org` on organization_id
- `idx_memberships_org_status` on (organization_id, status)

**RLS Policies (ACTIVE):**
- SELECT: `user_id = auth.uid() OR is_org_admin(organization_id)` — users see own + org_admins see all in their org
- INSERT (prod): `(user_id = auth.uid() AND status = 'pending') OR is_org_admin(organization_id)` — self-signup as pending OR admin can insert anyone
- INSERT (dev — split into two policies): `is_org_admin(organization_id)` for admin path, `user_id = auth.uid()` for self-signup
- UPDATE: `is_org_admin(organization_id)`
- DELETE: `is_org_admin(organization_id)`

**Note on dev vs prod policy differences:** prod has a combined INSERT policy; dev has two separate policies. Functionally equivalent for the cases we care about. Prod's combined policy is slightly more restrictive (requires self-signup to be pending), which is desirable.

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

**RLS state:** ON (was already on pre-cutover)

**RLS Policies (ACTIVE):**
- SELECT: users can read own profile OR org_admins can read profiles of org members
- UPDATE: users can update own profile only
- No INSERT/DELETE policies (managed by Supabase Auth lifecycle). **Consequence:** the signup `/complete` route can't upsert a profile with the authenticated client (RLS blocks the insert). It uses the **service-role client** instead (see "Service-role client" note below).

---

## Tables — Season Scoping

### team_seasons
Per-season instance of a team.

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
- `idx_team_seasons_org`, `idx_team_seasons_team`, `idx_team_seasons_season`

**RLS Policies (ACTIVE):**
- SELECT: `organization_id IN current_user_org_ids()`
- INSERT/UPDATE/DELETE: `is_org_admin(organization_id)`

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
- `idx_team_admins_membership`, `idx_team_admins_team`

**RLS Policies (ACTIVE):**
- SELECT: users can read own team_admin assignments OR org_admins can read all in their org (combined into one policy in prod, two policies in dev — functionally equivalent)
- INSERT/UPDATE/DELETE: org_admins of the membership's org (via EXISTS subquery on memberships)

---

### parent_teams
Links parent memberships to teams.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| membership_id | uuid | NOT NULL, FK memberships, ON DELETE CASCADE | |
| team_id | uuid | NOT NULL, FK teams, ON DELETE CASCADE | |
| is_default | boolean | NOT NULL, default false | Used for landing page |
| created_at | timestamptz | NOT NULL, default now() | |

**Constraints:** `parent_teams_unique` UNIQUE (membership_id, team_id)

**Indexes:**
- `idx_parent_teams_membership`, `idx_parent_teams_team`
- `idx_parent_teams_one_default` partial UNIQUE on (membership_id) WHERE is_default = true

**RLS Policies (ACTIVE):**
- SELECT: users can read own parent_team assignments OR org_admins can read all (combined in prod, split in dev)
- INSERT/UPDATE/DELETE: org_admins of the membership's org (via EXISTS subquery)

**Write pattern in Chunk H:** approveMembership inserts rows here when an admin approves a pending parent. Always inserts as a batch, with exactly one row having is_default=true.

---

## Tables — Tenant Data (Org-Scoped)

All tables in this section have `organization_id` NOT NULL with default Chicago Elite UUID (`75c11f73-5394-4ffc-bf39-9c708418e07b` in prod), FK organizations, ON DELETE CASCADE, indexed via `idx_<tablename>_org`.

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

**RLS Policies (ACTIVE):**
- SELECT: `organization_id IN current_user_org_ids()` — members can read teams in their orgs
- INSERT/UPDATE/DELETE: `is_org_admin(organization_id)`

---

### players, events, fields, league_games, standings, box_scores, player_stats, game_status_log, event_imports, weather_forecasts

All under RLS now (post-cutover).

**RLS pattern summary by table:**

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| players | `organization_id IN current_user_org_ids()` | `can_admin_team_season(team_season_id)` |
| events | `organization_id IN current_user_org_ids()` | `can_admin_team_season(team_season_id)` |
| box_scores | `organization_id IN current_user_org_ids()` | `can_admin_team_season(team_season_id)` |
| player_stats | `organization_id IN current_user_org_ids()` | `can_admin_team_season(team_season_id)` |
| fields | `organization_id IN current_user_org_ids()` | `is_org_admin(organization_id)` |
| league_games | `organization_id IN current_user_org_ids()` | `is_org_admin(organization_id)` |
| standings | `organization_id IN current_user_org_ids()` | `is_org_admin(organization_id)` |
| game_status_log | `organization_id IN current_user_org_ids()` | `is_org_admin(organization_id)` |
| event_imports | `organization_id IN current_user_org_ids()` | `is_org_admin(organization_id)` |
| weather_forecasts | `organization_id IN current_user_org_ids()` | `is_org_admin(organization_id)` |

**Per-season tables** (players, events, box_scores, player_stats, league_games, standings) link via `team_season_id` to team_seasons. Old `team_id` columns DROPPED in Chunk 3 except on standings (which kept its team_name). `fields.team_id` (a NOT NULL legacy column) was dropped in **Chunk 4b** (dev + prod) — no per-season tenant table now carries a redundant team_id.

**Cron / service-key safety:** weather_forecasts and game_status_log writes go through service-key paths (cron `/api/update-weather`, admin `/api/admin`). Service key bypasses RLS entirely. event_imports has NO active writers as of cutover.

---

### computed_standings (VIEW)
Aggregated standings view. Rewritten in Chunk 6 to expose `organization_id`. Views don't have their own RLS; access is controlled by RLS on underlying tables.

---

### push_subscriptions
Web Push notification subscriptions tied to a team.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| organization_id | uuid | NOT NULL, FK organizations | |
| team_id | uuid | NOT NULL | |
| membership_id | uuid | nullable, FK memberships, ON DELETE CASCADE | Added during mute UI work. Links subscription to a membership so push helper can check muted_chats. |
| endpoint | text | NOT NULL | Web Push endpoint URL |
| p256dh | text | NOT NULL | Push encryption key |
| auth | text | NOT NULL | Push auth secret |
| user_agent | text | nullable | |
| last_pushed_at | timestamptz | nullable | |
| created_at | timestamptz | default now() | |

**Indexes:**
- `idx_push_subscriptions_membership` on membership_id

**RLS state:** ON (pre-existing)

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
| team_id | uuid | NOT NULL, FK teams, ON DELETE CASCADE | |
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

**Realtime:** added to `supabase_realtime` publication.

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

**Realtime:** added to publication. Client subscribes to INSERT/DELETE events globally (no team_id column on this table). UI refetch is debounced (2 seconds).

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
- UPDATE/DELETE: team_admins/org_admins

---

### team-messages bucket
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
- DELETE: same scope (app layer restricts to authors; chat RLS only allows authors to delete the row itself)

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

**Read pattern (SELECT):** Approved members can read all data in their orgs (via `organization_id IN current_user_org_ids()`). Cross-team visibility within an org is allowed.

**Write pattern — Org-wide (org_admin only):**
teams, fields, league_games, standings, event_imports, weather_forecasts, team_seasons, seasons, game_status_log, organizations

**Write pattern — Team-scoped (team_admin OR org_admin):**
players, events, box_scores, player_stats, team_posts, team_post_reactions

**Write pattern — Open-to-team-members:**
team_messages, team_message_reactions (anyone in the team's org with access to the team can write)

**Write pattern — Self-managed:**
profiles (own row only), memberships (own pending row on insert; org_admins can update others), team_messages delete (author only), team_message_reactions delete (own only), team_post_reactions delete (own only)

---

## Migration files in repo

- `lib/db/migrations/chat-v1.sql` — Chat v1 schema, RLS, Realtime publication, Storage policies. **Already RUN against dev AND prod.**

**Other migrations run ad-hoc and not saved to repo:**
- Mute UI: added `push_subscriptions.membership_id` column (nullable FK to memberships, ON DELETE CASCADE), with `idx_push_subscriptions_membership` index. Run against dev and prod.
- Cutover: `alter table public.<name> enable row level security` for all 17 tenant tables in dev AND prod. Policies were created during Chunk 8; cutover just flipped the master switch.
- Chunk 4b: `alter table public.fields drop column team_id;` — run against dev AND prod.
- Test harness: User D profile backfilled (`44444444-4444-4444-4444-444444444444` → "Daniel Davis", userd@example.com).
- Test harness: User C linked to Moore via parent_teams.

---

## Service-role client (pre-auth / new-user access)

`lib/supabase/service.ts` exposes `createServiceClient()` — a Supabase client built with `SUPABASE_SERVICE_ROLE_KEY` that **bypasses RLS entirely**. Server-only; never import into client code.

**Why it exists:** After the cutover, RLS blocks reads/writes for a visitor who has no membership yet. Public signup broke because:
- `organizations` SELECT policy is `id IN current_user_org_ids()` → an anonymous/new user sees no orgs → slug validation failed (404).
- `profiles` has no INSERT policy → the new user's profile upsert failed.

**Where it's used:**
- `app/o/[slug]/signup/page.tsx` — org slug lookup.
- `app/o/[slug]/signup/complete/page.tsx` — org lookup + `profiles` upsert + `memberships` insert/select. The user session is still read with the authenticated client; only DB work uses the service client.

**Rule:** any pre-auth or new-user server route that touches tenant tables must use the service client. After the user is an approved member, use the normal authenticated client so RLS still applies.

**Env var:** `SUPABASE_SERVICE_ROLE_KEY` (prod `service_role` secret) — set in local `.env.local` AND Vercel (Production scope). Missing/mis-scoped → "Missing Supabase service env vars" at runtime.

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
- `fields.team_id` (NOT NULL legacy column — dropped in Chunk 4b, dev + prod)

---

## Outstanding items

1. ✅ **Chunk 4b** — DONE. Only `fields.team_id` remained; dropped in dev + prod. All other per-season redundant team_id columns were already dropped in Chunk 3.
2. ✅ **fields.team_id NOT NULL** — DONE (dropped in Chunk 4b).
3. **Decide on `memberships.user_id` FK to `auth.users(id)`** — present in prod, dropped in dev for test harness.
4. **Decide on `memberships.approved_by` FK** — present in both prod and dev. Causes test friction in dev (fake UUIDs can't be used). Either drop in dev or always omit in dev tests.
5. ✅ **Tournament box scores bug** — FIXED (app-side, not data/RLS). Opponent box_score row shares Elite's team_season_id and is distinguished by `team_id = null`; the line-score finder was rewritten in `app/event/[id]/page.tsx` to match the "us" row on `team_id` rather than differing team_season_id.

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

**Cutover history (this session):**
- Verified service-key writers (cron, admin route) before flipping any table the cron writes to.
- Validated each batch in dev with impersonation tests (User C parent, User B cross-tenant) before mirroring to prod.
- Diagnosed one pre-existing bug (tournament box scores) by toggling RLS off during Batch 3.
- Flipped tables one at a time in prod with manual app testing between each.
- Final order: organizations → seasons → team_admins → parent_teams → memberships (memberships LAST because every helper depends on it).
