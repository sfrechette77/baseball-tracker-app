# On Deck — Design Notes

## Next session starts here

**Top priority:** decide what feature to build next. Two candidates:

1. **Build Chunk H — Signup + admin approval flow.** This is the gate before any non-Chicago-Elite org can use the product. Without it, the multi-tenant work is theoretical. Required before RLS cutover and before any second org can sign up. Probably 2-3 sessions of work.

2. **Build DMs (1:1 conversations between team members).** Reuses ~80% of Chat plumbing. Highest moderation complexity — needs blocking/muting/read receipts. Fun to build, but lower business priority than Chunk H.

**Recommended:** start Chunk H. It unblocks revenue. DMs can wait.

**Smaller polish items to consider before either feature:**
- Chat reactions don't realtime-update across devices (intentional v1 tradeoff). Decide if this should be fixed before launch.
- Mute UI: `memberships.muted_chats` column exists but no UI to toggle. Build before launch so parents can mute chat-heavy teams.
- Update Design.md / SCHEMA.md is now done as of this update.

---

## Where we are now

**Phase status:**
- ✅ Schema migration complete (Chunks 0-8 deployed to prod, RLS dormant on most tenant tables)
- ✅ All 7 app pages migrated to team_season_id (Chunks A-G)
- ✅ BottomNav extracted to shared component
- ✅ Team page built — consolidates Standings + Results + Roster sub-views
- ✅ MSBL Rules moved to dedicated /team/rules route
- ✅ **Feed v1 fully shipped** (backend + UI + push + polish)
- ✅ **Chat v1 fully shipped** (schema + actions + UI + realtime + push)
- ✅ Messages page consolidates Feed + Chat under one nav button
- ✅ Skeleton loaders replaced spinning baseball across all pages
- ⬜ Chat reactions realtime sync (parked v1 tradeoff)
- ⬜ Mute UI for chat (column exists, no UI)
- ⬜ Chunk H — Signup + admin approval flow (required before cutover)
- ⬜ DMs (after Chunk H)
- ⬜ Cutover — Enable RLS on tenant tables + validate

## Key identifiers (DO NOT LOSE)

- **Chicago Elite org UUID (prod):** `75c11f73-5394-4ffc-bf39-9c708418e07b`
- **Chicago Elite org UUID (dev):** `25c71684-dcdb-4ccc-9e8b-4f4357c3b8ee`
- **Steve's auth.users.id:** `6c87af4c-8e23-45ad-8453-6530116b3deb`
- **Steve's membership_id** (org_admin, Chicago Elite): `7cbfaaa5-e502-4f5f-a576-a0dbd668cf98`
- **Moore team UUID:** `4beb0750-1883-4b56-a386-db280675036c`
- **Ayeski team UUID:** `0c8cc8d0-2398-41c2-8ba0-036d62ee13a6`

## Feed v1 — SHIPPED

Scope: admins post text + optional image, parents react with emoji, push notifications.

### Schema (deployed to prod)
- team_posts (team_id, author_membership_id, body, image_url, image_path, soft delete via deleted_at)
- team_post_reactions (post_id, membership_id, emoji, unique per triple)
- Storage bucket: team-posts, private, path: {org_id}/{team_id}/{post_id}.{ext}
- RLS gated by can_read_team helper (org_admin OR team_admin OR linked parent)
- SELECT policy on team_posts allows admins to see their own soft-deleted posts (required for RETURNING clause after UPDATE deleted_at)

### Server Actions (app/actions/feed.ts)
- createPost, deletePost, addReaction, removeReaction, getFeed
- Pattern: `{ ok: true, ... } | { ok: false, error: string }` discriminated union
- Push notification fires after createPost succeeds

### UI
- components/feed/{ReactionBar, PostCard, Composer}.tsx
- Rendered inside /messages?view=announcements (no longer standalone /feed route)
- /feed redirects to /messages?view=announcements

### Key bugs fixed during polish session
- UI delete failed because getFeed returned soft-deleted posts to admins (RLS allows it). One-line fix: `.is('deleted_at', null)` filter in getFeed.
- "Unknown author" fixed by querying memberships + profiles separately and merging in app code (PostgREST joins through auth.users fail via schema cache).

## Chat v1 — SHIPPED

Scope: realtime team chat, everyone can post, text + image, push on every message.

### Schema (deployed to prod via lib/db/migrations/chat-v1.sql)
- team_messages (team_id, author_membership_id, body, image_url, image_path) — hard delete (no soft delete)
- team_message_reactions (message_id, membership_id, emoji, unique per triple)
- memberships.muted_chats (uuid[] — array of team_ids whose chat the user has muted; default empty array)
- Storage bucket: team-messages, private, path: {org_id}/{team_id}/{message_id}.{ext}
- RLS gated by can_read_team helper (same as Feed). Everyone with approved membership in a team can post to that team's chat. Only the author can delete their own message.
- Realtime publication enabled on both team_messages and team_message_reactions (INSERT/DELETE events fire to subscribed clients).

### Server Actions (app/actions/chat.ts)
- sendMessage, deleteMessage, addReaction, removeReaction, getMessages
- Uses getCurrentMembershipForTeam helper that picks highest-priority role when user has multiple memberships (org_admin > team_admin > parent). Different from Feed's getCurrentMembership which only accepts admin roles.
- deleteMessage uses 0-rows-affected check (`.select('id')` after delete) to catch silent RLS failures — lesson learned from Feed.
- Push notification fires after sendMessage. Tag is per-team (`team-chat-${teamId}`) so newest message replaces older on iOS lock screens.

### UI
- components/chat/{MessageReactionBar, MessageBubble, MessageComposer}.tsx
- Rendered inside /messages?view=chat
- MessageBubble: own messages right-aligned red, others left-aligned with avatar/initials. Tap bubble to reveal React/Delete actions.
- MessageComposer: text + image picker + send button. Enter sends, Shift+Enter newline. Auto-resizing textarea (max 120px).
- Author grouping: consecutive messages from same author within 5 minutes share one avatar/timestamp header (showAuthor prop).
- Realtime subscription on team_messages table re-fetches getMessages on any INSERT/DELETE. Reactions deliberately NOT subscribed (would cause refetch spam; reactions use optimistic local updates).

### Reusable push helper
- lib/push/send.ts — sendPushToTeam(teamId, payload)
- Used by both Feed createPost and Chat sendMessage
- Refactored out of app/api/push/send/route.ts (route now thin wrapper that does auth then delegates)

### Layout fix (mid-session bug)
- Chat composer was getting pushed off-screen on mobile due to flex height math.
- Fixed: composer is now `fixed bottom-0` above the bottom nav (z-10, bg-black, max-w-sm centered). Scroll area gets explicit bottom padding to clear composer + nav + safe-area.

### v1 tradeoffs (parked)
- Reactions from other users don't appear in realtime — only updates on user's own re-fetch (sending, refresh, page focus). Acceptable for v1.
- No admin override on delete (only authors can delete their own messages). Different from Feed where org_admins can delete any post. Reasoning: chat is conversation, moderation feels intrusive.

## /messages page

- Combined home for Feed + Chat
- Sub-tabs at top: Announcements | Chat (URL search param `?view=`)
- Defaults to Announcements (matches old Feed behavior)
- Bottom nav: Home | Schedule | Team | Stats | **Messages** (chat-bubble icon, replaced Feed)
- /feed route redirects to /messages?view=announcements (backward compat for bookmarks / old push URLs)
- Feed push URL updated to /messages?view=announcements (skips redirect step)

## Context

Converting baseball-tracker-app from a single-tenant app (Chicago Elite) into a multi-tenant SaaS where multiple youth baseball organizations can each have their own branded experience. Validated demand. Committed to building.

## Schema

See SCHEMA.md for current state of tables, columns, constraints, and RLS policies.

## Project naming

- Product working name: "On Deck"
- Supabase org renamed to "On Deck v.1"
- Domain TBD (will need to register one before launch)

## Users

- Primary users: parents. Consume team info — schedules, scores, rosters, notifications.
- Power users: org admins and team admins. Manage org-level and team-level content respectively.
- One person can hold multiple roles. A coach who is also a parent of a player on the team is the common case — both 'parent' and 'team_admin' roles for the same user.
- No multi-org users. A user belongs to exactly one organization.

## Sign-up and access flow (PLANNED — not yet built)

- Self-registration: parents create their own accounts with just name/email/password. They land in 'pending' state.
- Admin approval: an admin reviews the pending queue. On approval, the admin also assigns the parent to one or more teams (their kids' teams), with one team marked as their default.
- Default landing: when a parent logs in, they land on their default team. They can switch to any other team in the org to browse.

## Admin roles

- Org admin: can do anything in the org — manage all teams, approve parents, change brand/settings, invite other admins.
- Team admin: scoped to specific team(s). Can manage events, post updates, and send notifications for those teams only.

## Routing

- Path-based: all org-scoped pages under /o/{slug}/... (not yet implemented)
- Non-org pages at root: /login, /signup, /account
- Middleware enforces: slug exists → user is logged in → user is member of org
- Every org-scoped route runs through this middleware; nothing bypasses

## Decisions made

- Multi-tenant via organizations table (not per-fork)
- One user belongs to one org (no multi-org users)
- One user can hold multiple roles in their org (parent + team_admin common)
- Self-registration with admin approval gate
- Admin assigns team(s) at approval time (not parent self-selecting)
- Parents land on default team, can browse others
- Two admin tiers: org_admin and team_admin
- Brand strings and colors stored on the organizations record, loaded at runtime
- Brand colors: primary_color AND secondary_color stored on organizations
- Logo files will live in Supabase Storage (multi-tenant native); logo_url field stores URL
- Pattern C for season handling: permanent teams + per-season instances
- Season rollover is an admin action (not automatic) — once per year per org
- Old seasons preserved, queryable, but not the default view
- Parent re-affiliation at season rollover: hybrid — admin runs a "roll forward" action that pre-creates parent_teams rows assuming continuity, admin edits exceptions before notifying parents
- Approval workflow: pending → approved is for self-registration. Admin-initiated role grants (e.g., promoting a user to team_admin) skip pending and create approved rows directly.
- Routing: path-based (/o/{slug}/...). Subdomain routing deferred to post-revenue when custom-domain support becomes a paid feature.
- Per-season tables (players, events, box_scores, player_stats, league_games, standings) link to team_seasons, not directly to teams. Permanent team_id is dropped post-cutover; team is reachable via join through team_seasons.
- player_stats does not need a team-level link (reaches team through event or player)
- team_admins and parent_teams link to teams (permanent), not team_seasons. Role attachment persists across seasons.
- Membership modeling: one row per role (multi-role users have multiple rows)
- Enum named `membership_role` (not `org_role`) to avoid conflict with deprecated production type
- Feature flags as boolean columns initially; migrate to jsonb only if flag count grows
- Cascade deletes from organizations → seasons/memberships; SET NULL on audit fields so users can be deleted without destroying org history
- League opponent teams: all 17 existing teams (Moore + Ayeski + 15 league opponents) have organization_id = Chicago Elite's UUID. Will revisit when a second league-running org signs up.
- Feed posts attach to permanent team_id (not team_season_id). Parents lose feed access when removed from parent_teams. Matches GameChanger behavior.
- Chat messages attach to permanent team_id (same model as Feed). Hard delete only — chat is ephemeral.
- Chat reactions don't realtime sync across devices in v1 (would cause refetch spam). Reactions use optimistic local updates.

## Parked / explicitly out of scope (for now)

- Stripe billing and subscription management — Phase 4
- Marketing site, free-to-paid conversion — Phase 5
- Multi-org users (one person in multiple orgs) — rejected; defer if customer demand
- Per-player parent linking (parent sees only their own kid's data) — rejected
- Subdomain routing and custom domains — deferred
- Migration from Pattern C to anything more complex — defer until needed
- Cross-org league play / shared opponent rosters — deferred
- Batting order in stats (deferred — needs batting_order_position column on player_stats)
- Edit message UI — schema supports it (updated_at column exists) but no UI in v1
- Admin moderation of chat messages — v1 only allows author to delete their own

## Production migration log

### Critical fix: RLS was already ON in production
After Chunk 8d (dropping permissive policies), prod app broke because RLS was actually enabled on 7 tables from the start (events, players, fields, box_scores, player_stats, standings, weather_forecasts). The "Public can read X" policies with qual='true' had been masking this.
- Resolution: disabled RLS on those 7 tables. Policies still exist — dormant until cutover.
- Lesson for cutover: explicitly verify and set RLS state on EVERY tenant table, don't assume off.

### Weather forecasts gotcha
weather_forecasts is rebuilt daily by a cache refresh process. Chunk 3 backfill stamped rows correctly but they were wiped overnight.
- Fix: set column default to Chicago Elite UUID FIRST, then backfill, then NOT NULL.
- Pattern: any cache/refresh table needs DEFAULT set before NOT NULL is enforced.

### Migration progress (all complete)
- Chunk 0 — Pre-flight audit
- Chunk 1 — Drop orphans
- Chunk 2 — Control plane (organizations, seasons, memberships, profiles columns)
- Chunk 3 — Add organization_id to 14 tenant tables + backfill
- Chunk 4 — team_seasons + per-season backfill (Approach A: kept old team_id columns)
- Chunk 5 — team_admins + parent_teams join tables
- Chunk 6 — computed_standings investigation + organization_id (it's a VIEW)
- Chunk 7 — Enforce NOT NULL on organization_id columns
- Chunk 8 — Helper functions + RLS policies (RLS still NOT enabled on tenant tables)
- ⬜ Chunk 4b — Drop redundant team_id columns from per-season tables (post-cutover)
- ⬜ Cutover — Enable RLS, deploy refactored app

### App refactor (Chunks A-G all complete and deployed)
- Chunk A — Org context provider
- Chunk B — Homepage migrated to team_season_id
- Chunk C — Schedule page migrated + loading flash fix
- Chunk D — Standings migrated + isUs highlight bug fix
- Chunk E — Stats page migrated
- Chunk F — Roster page migrated
- Chunk G — Event detail page migrated

### Team page rebuild
- Replaced Standings + Roster bottom nav tabs with single Team tab
- Sub-view toggle: Standings | Results | Roster (URL search param ?view=...)
- MSBL Rules moved to dedicated /team/rules route
- Player names in Roster sub-view link to /player/[id]
- Player → Roster back link returns to /team?view=roster (not /roster standalone)

### Pre-prod cleanup
Before cutover, fake memberships in dev (UUIDs 1111..., 2222..., etc.) should NOT be carried over. Production creates real memberships from real signups.

### Feed v1 lessons learned (polish session)
- Server Actions need `allowedOrigins` in next.config.ts for Codespace dev URL
- Soft delete with RLS requires SELECT policy to allow admins to see their own deleted rows (RETURNING clause after UPDATE fails otherwise)
- next.config.ts is only read at startup — config changes require dev server restart
- useSearchParams() in 'use client' components requires Suspense wrapper for production build
- Discriminated unions narrow correctly; the `'error' in ctx` pattern does not narrow optional fields
- PostgREST joins through auth.users don't work via schema cache; query profiles separately and merge

### Chat v1 lessons learned (build session)
- `can_read_team` helper was missing in dev (had been added to prod during Feed work). Created it in dev before chat schema would land.
- Default org_id on new tables references prod UUID; in dev had to ALTER COLUMN SET DEFAULT to dev's Chicago Elite UUID after table creation.
- Storage bucket must be created via Supabase dashboard UI (not SQL), then RLS policies applied separately.
- Realtime publication needs `alter publication supabase_realtime add table public.X` for each table to push live.
- Chat layout: composer must be `fixed bottom-0` above the bottom nav (not flex-child) to be visible without scrolling on mobile.

## RLS test harness (in on-deck-dev only)

5 fake user UUIDs seeded into on-deck-dev for testing RLS policies. The `memberships.user_id` FK to `auth.users` is dropped in dev to allow these fake user IDs. This relaxation never ships to prod.

### Fake users in on-deck-dev

| User ID                              | Org                | Role        | Status   | Notes                          |
|--------------------------------------|--------------------|-------------|----------|--------------------------------|
| 11111111-1111-1111-1111-111111111111 | chicago-elite      | org_admin   | approved | User A                         |
| 22222222-2222-2222-2222-222222222222 | northside-knights  | org_admin   | approved | User B                         |
| 33333333-3333-3333-3333-333333333333 | chicago-elite      | parent      | approved | User C — linked to Moore       |
| 44444444-4444-4444-4444-444444444444 | chicago-elite      | parent      | pending  | User D — for approval gate test|
| 55555555-5555-5555-5555-555555555555 | chicago-elite      | team_admin  | approved | User E — scoped to Moore only  |

User C is linked to Moore via parent_teams (added during chat RLS testing).

### Impersonation pattern (for testing RLS policies)

```sql
set role authenticated;
set request.jwt.claims to '{"sub": "<uuid>", "role": "authenticated"}';
-- ...your queries here...
reset role;
reset request.jwt.claims;
```

For anonymous access: `set role anon;` then `reset role;` when done.

## Future features (parked)

### DMs
After chat v1 is stable. 1:1 conversations between team members. Highest moderation complexity — needs blocking, muting, read receipts. Reuses ~80% of chat plumbing (schema, storage, RLS, push helper).

### Batting order in stats
Currently game stats display in jersey-number order. Parents expect batting order. Add player_stats.batting_order_position (integer, nullable). Order display by batting_order_position NULLS LAST, jersey_number. Old games without lineup data continue showing by jersey. Effort: medium — schema change is trivial, lineup-entry UI is the real work.

### Chat features deferred to v2
- Realtime reaction sync across devices
- @mentions / notification on mention
- Read receipts
- Typing indicators
- Per-user mute UI (column already exists)
- Admin moderation override on delete
- Edit messages
- Message search
- Pinned messages
