# On Deck — Design Notes

## Next session starts here

**Top priority:** Cutover — enable RLS on the 17 tenant tables currently OFF in production. This is the last major architectural step before the multi-tenant story is real. RLS policies already exist on these tables (created in Chunk 8); they're dormant. Cutover = flip them on + validate nothing breaks.

**Risk:** RLS bugs surface as silent data hiding, not loud errors. Cutover needs careful validation per table.

**Recommended approach:**
1. Make a checklist of the 17 tables
2. Enable RLS one or two at a time, test the app, validate
3. Track what breaks, fix policy or app code as needed
4. Lock down only after all tables are green

**Tables still dormant (RLS off):**
organizations, seasons, memberships, teams, team_seasons, team_admins, parent_teams, players, events, fields, league_games, standings, box_scores, player_stats, game_status_log, event_imports, weather_forecasts

**Active polish items (smaller wins available):**
- Build admin UI to manage existing members (edit team assignments, delete memberships, change default team). Right now once a parent is approved, the only way to fix their team assignment is direct SQL.
- Build admin UI to invite team_admin role (bypass pending state, create approved directly). Useful for assistant coaches.
- Email notifications on approval (would close the "parent doesn't know they were approved" gap; right now they need to refresh or the on-mount checker fires).

---

## Where we are now

**Phase status:**
- ✅ Schema migration complete (Chunks 0-8 deployed to prod, RLS dormant on most tenant tables)
- ✅ All 7 app pages migrated to team_season_id (Chunks A-G)
- ✅ BottomNav extracted to shared component
- ✅ Team page built — consolidates Standings + Results + Roster sub-views
- ✅ MSBL Rules moved to dedicated /team/rules route
- ✅ **Feed v1 fully shipped**
- ✅ **Chat v1 fully shipped** (schema + actions + UI + realtime + push)
- ✅ Messages page consolidates Feed + Chat under one nav button
- ✅ Skeleton loaders replaced spinning baseball across all pages
- ✅ **Chunk H shipped** — Signup + admin approval flow with Google OAuth
- ✅ **Mute UI shipped** — users can mute chat push notifications per team
- ✅ **Realtime reactions sync shipped** — reactions update across devices with 2s debounce
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
- SELECT policy on team_posts allows admins to see their own soft-deleted posts

### Server Actions (app/actions/feed.ts)
- createPost, deletePost, addReaction, removeReaction, getFeed
- Pattern: `{ ok: true, ... } | { ok: false, error: string }` discriminated union
- Push notification fires after createPost succeeds

### UI
- components/feed/{ReactionBar, PostCard, Composer}.tsx
- Rendered inside /messages?view=announcements (no longer standalone /feed route)
- /feed redirects to /messages?view=announcements

## Chat v1 — SHIPPED

Scope: realtime team chat, everyone can post, text + image, push on every message, per-team mute, realtime reaction sync.

### Schema (deployed to prod via lib/db/migrations/chat-v1.sql)
- team_messages (team_id, author_membership_id, body, image_url, image_path) — hard delete (no soft delete)
- team_message_reactions (message_id, membership_id, emoji, unique per triple)
- memberships.muted_chats (uuid[] — array of team_ids whose chat the user has muted; default empty array)
- Storage bucket: team-messages, private, path: {org_id}/{team_id}/{message_id}.{ext}
- RLS gated by can_read_team helper (same as Feed). Everyone with approved membership in a team can post. Only the author can delete their own message.
- Realtime publication enabled on both team_messages and team_message_reactions

### Server Actions (app/actions/chat.ts)
- sendMessage, deleteMessage, addReaction, removeReaction, getMessages
- getMutedChats, toggleMuteChat (added during mute UI work)
- Uses getCurrentMembershipForTeam helper that picks highest-priority role when user has multiple memberships (org_admin > team_admin > parent)
- deleteMessage uses 0-rows-affected check (`.select('id')` after delete) to catch silent RLS failures
- Push notification fires after sendMessage. Tag is per-team (`team-chat-${teamId}`) so newest message replaces older on iOS lock screens.

### UI
- components/chat/{MessageReactionBar, MessageBubble, MessageComposer}.tsx
- Rendered inside /messages?view=chat
- MessageBubble: own messages right-aligned red, others left-aligned with avatar/initials. Tap bubble to reveal React/Delete actions.
- MessageComposer: text + image picker + send button. Enter sends, Shift+Enter newline. Auto-resizing textarea (max 120px).
- Author grouping: consecutive messages from same author within 5 minutes share one avatar/timestamp header.
- Mute toggle at top right of chat tab (🔔 Notifications on / 🔕 Muted) — flips memberships.muted_chats for current team.
- Anti-flicker: mute toggle hidden until server confirms initial state.

### Realtime (shipped + extended)
- Initial v1: subscribed to team_messages INSERT/DELETE only. Reactions deferred.
- Now: also subscribed to team_message_reactions INSERT/DELETE with 2-second debounce on refetch (prevents spam when 5 people react in quick succession).
- Reaction subscription is global (no team_id filter — team_message_reactions doesn't have a team_id column; reaches team via message_id join). For 12-family teams this is invisible. At scale would want to add team_id column to reactions table and filter.

### Reusable push helper (lib/push/send.ts)
- sendPushToTeam(teamId, payload)
- Joins push_subscriptions → memberships to skip subscribers who have muted this team's chat
- Subscriptions without membership_id (legacy/no link) pass through unfiltered
- Used by both Feed createPost and Chat sendMessage

### Layout fix (mid-session bug)
- Chat composer was getting pushed off-screen on mobile due to flex height math.
- Fixed: composer is now `fixed bottom-0` above the bottom nav (z-10, bg-black, max-w-sm centered). Scroll area gets explicit bottom padding to clear composer + nav + safe-area.

## /messages page

- Combined home for Feed + Chat
- Sub-tabs at top: Announcements | Chat (URL search param `?view=`)
- Defaults to Announcements (matches old Feed behavior)
- Bottom nav: Home | Schedule | Team | Stats | **Messages** (chat-bubble icon, replaced Feed)
- /feed route redirects to /messages?view=announcements (backward compat for bookmarks / old push URLs)
- Feed push URL updated to /messages?view=announcements (skips redirect step)

## Chunk H — Signup + Admin Approval — SHIPPED

Scope: org-scoped self-registration for parents, admin approval queue with team assignment.

### Signup flow
- /o/[slug]/signup — public Server Component route, validates slug exists
- SignupForm.tsx — client component, "Sign up with Google" button, uses signInWithOAuth with redirectTo /auth/callback?next=/o/[slug]/signup/complete
- /o/[slug]/signup/complete — Server Component that runs after OAuth callback. Creates/upserts profile, creates pending membership (status='pending', role='parent', organization_id=org)
- Shows "You're almost in" pending screen with user email + sign-out button
- PendingChecker.tsx — embedded client component that polls on mount + on window focus. When user is approved, redirects to /. No periodic polling.

### Public route handling
- middleware.ts whitelists /o/[slug]/signup and /o/[slug]/signup/complete (regex match)
- AppShell component (components/app-shell.tsx) hides the global Header on pre-auth routes (login, auth callback, signup). Renders just `<main>{children}</main>` for those.
- Public routes are duplicated in both middleware.ts AND app-shell.tsx — must stay in sync if changing.

### Admin approval
- Added 7th tab to /admin: "👋 Pending"
- app/actions/admin.ts — Server Actions: getPendingMemberships, getOrgTeams, approveMembership
- requireOrgAdmin() helper guards each action; checks for an approved org_admin membership for the calling user
- approveMembership: validates target membership belongs to admin's org, validates all team IDs belong to admin's org, flips status to approved, creates parent_teams rows, marks one as default
- UI: per-row Approve button → modal with team checkboxes (defaulting to all checked) + "default team" radio. Submit shows ✅ and removes row.

### Tradeoff: admin password remains for now
- The rest of /admin still uses the password-gated /api/admin route. The Pending tab uses Supabase-authenticated Server Actions instead.
- Long-term: kill the password gate entirely and rely on Supabase Auth + org_admin role. Refactor for future session.

## Mute UI — SHIPPED

Scope: per-team chat mute via memberships.muted_chats. Required adding membership_id column to push_subscriptions so push helper can filter by mute state.

### Schema additions
- push_subscriptions.membership_id uuid — FK to memberships, ON DELETE CASCADE, nullable initially. Run against both dev and prod.
- Index: idx_push_subscriptions_membership

### Flow
1. PushSubscribeButton sends membershipId in subscribe POST body (from useActiveOrg hook)
2. /api/push/subscribe route writes membership_id to the push_subscriptions row
3. sendPushToTeam joins push_subscriptions → memberships, filters out subs where membership.muted_chats includes the team_id
4. ChatView calls getMutedChats on mount to seed UI; toggleMuteChat on tap

### Legacy subscriptions
- Subscriptions created BEFORE the migration have membership_id = null. They pass through the filter (treated as "no mute info available, send anyway"). One-time cleanup deleted 2 stale rows in prod.

### Anti-flicker fix
- ChatView shows the mute toggle button only after the initial getMutedChats response. Without this, the button briefly showed "🔔 Notifications on" before updating to the user's actual state.

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
- One person can hold multiple roles. A coach who is also a parent of a player on the team is the common case.
- No multi-org users. A user belongs to exactly one organization.

## Sign-up and access flow (SHIPPED — Chunk H)

- Self-registration: parents visit /o/{slug}/signup, click "Sign up with Google". Land in 'pending' state with their profile auto-created from Google data.
- Admin approval: org_admin opens /admin → Pending tab. Sees pending memberships. Per-row Approve → modal with team checkboxes (defaulting to all checked) + default-team radio.
- Default landing: when a parent logs in after approval, they land on their default team. They can switch to any other team they're linked to via parent_teams.
- Auth provider: Google OAuth only in v1. Email/password and magic link deferred.
- No reject UI in v1. To deny a parent, admin would delete the membership row directly via SQL (rare case).
- No email notification on approval. PendingChecker re-checks on focus so parent's pending screen auto-redirects when they return to the tab after approval.

## Admin roles

- Org admin: can do anything in the org — manage all teams, approve parents, change brand/settings, invite other admins.
- Team admin: scoped to specific team(s). Can manage events, post updates, and send notifications for those teams only.

## Routing

- Path-based: org-scoped pre-auth pages under /o/{slug}/... (currently just signup; full /o/{slug}/[everything else] routing deferred to cutover)
- Non-org pages at root: /login, /signup (via /o/{slug}/signup), /account, etc.
- Middleware enforces: not-public route → must be logged in. Org-scoped post-auth middleware deferred.

## Decisions made

- Multi-tenant via organizations table (not per-fork)
- One user belongs to one org (no multi-org users)
- One user can hold multiple roles in their org (parent + team_admin common)
- Self-registration with admin approval gate (shipped)
- Admin assigns team(s) at approval time (shipped)
- Parents land on default team, can browse others
- Two admin tiers: org_admin and team_admin
- Brand strings and colors stored on the organizations record, loaded at runtime
- Brand colors: primary_color AND secondary_color stored on organizations
- Logo files will live in Supabase Storage; logo_url field stores URL
- Pattern C for season handling: permanent teams + per-season instances
- Season rollover is an admin action (not automatic) — once per year per org
- Old seasons preserved, queryable, but not the default view
- Approval workflow: pending → approved is for self-registration. Admin-initiated role grants skip pending.
- Routing: path-based (/o/{slug}/...). Subdomain routing deferred to post-revenue.
- Per-season tables link to team_seasons. Permanent team_id dropped post-cutover.
- team_admins and parent_teams link to teams (permanent), not team_seasons
- Membership modeling: one row per role
- Enum named `membership_role`
- Feature flags as boolean columns initially
- Cascade deletes from organizations → seasons/memberships; SET NULL on audit fields
- League opponent teams: all 17 existing teams have organization_id = Chicago Elite. Will revisit when a second league-running org signs up.
- Feed and Chat attach to permanent team_id. Parents lose access when removed from parent_teams.
- Chat hard delete only — chat is ephemeral.
- Chat reactions now realtime sync via debounced refetch (2s debounce on team_message_reactions INSERT/DELETE).
- Chat mute: per-membership via memberships.muted_chats uuid[]. Indefinite (on/off, no time-based).
- Auth provider for signup: Google OAuth only in v1.

## Parked / explicitly out of scope (for now)

- Stripe billing and subscription management — Phase 4
- Marketing site, free-to-paid conversion — Phase 5
- Multi-org users (one person in multiple orgs) — rejected
- Per-player parent linking (parent sees only their own kid's data) — rejected
- Subdomain routing and custom domains — deferred
- Migration from Pattern C to anything more complex — defer until needed
- Cross-org league play / shared opponent rosters — deferred
- Batting order in stats (deferred — needs batting_order_position column on player_stats)
- Edit message UI — schema supports it (updated_at column) but no UI in v1
- Admin moderation of chat messages — v1 only allows author to delete their own
- Email-based signup or magic link — Google OAuth only in v1
- Reject button in admin pending queue — manual SQL workaround for now
- Email notifications on approval — PendingChecker re-check pattern instead

## Production migration log (condensed)

### Critical fix: RLS was already ON in production (Chunk 8d era)
- After dropping permissive policies, prod broke because RLS was actually enabled on 7 tables that had been masked by qual=true SELECT policies.
- Resolution: disabled RLS on those 7 tables. Policies still exist — dormant until cutover.
- Lesson for cutover: explicitly verify and set RLS state on EVERY tenant table.

### Weather forecasts gotcha (Chunk 3 era)
- weather_forecasts rebuilt daily by a cache refresh process. Chunk 3 backfill got wiped overnight.
- Fix pattern: set column default FIRST, then backfill, then NOT NULL.

### Migration progress (all complete)
- Chunk 0–8: schema migration to multi-tenant
- Chunks A–G: app pages migrated to team_season_id
- Team page rebuild: Standings + Results + Roster sub-views, MSBL Rules to /team/rules
- Feed v1: schema + actions + UI + push + skeleton loaders
- Chat v1: schema + actions + UI + realtime + push + mute + realtime reactions
- Chunk H: signup + admin approval flow
- ⬜ Chunk 4b — Drop redundant team_id columns from per-season tables (post-cutover)
- ⬜ Cutover — Enable RLS, deploy refactored app

### Pre-prod cleanup
Before cutover, fake memberships in dev (UUIDs 1111..., 2222..., etc.) should NOT be carried over.

### Feed v1 lessons learned
- Server Actions need `allowedOrigins` in next.config.ts for Codespace dev URL
- Soft delete with RLS requires SELECT policy to allow admins to see their own deleted rows
- next.config.ts is only read at startup
- useSearchParams() in 'use client' components requires Suspense wrapper for production build
- Discriminated unions narrow correctly; the `'error' in ctx` pattern does NOT narrow optional fields
- PostgREST joins through auth.users don't work via schema cache; query profiles separately and merge

### Chat v1 lessons learned
- can_read_team helper was missing in dev. Created it before chat schema would land.
- Default org_id on new tables references prod UUID; in dev had to ALTER COLUMN SET DEFAULT to dev's Chicago Elite UUID after table creation.
- Storage bucket must be created via Supabase dashboard UI, then RLS policies applied separately.
- Realtime publication needs `alter publication supabase_realtime add table public.X` per table.
- Chat layout: composer must be `fixed bottom-0` above the bottom nav.

### Chunk H lessons learned
- memberships.approved_by has FK to auth.users that rejects fake test UUIDs in dev. Tests skip setting approved_by. Should drop this FK in dev (matches the existing user_id FK relaxation), OR keep as-is and note for future tests.
- Long-block paste from chat into Codespaces editor sometimes drops `<` characters right before newlines — caused 95 cascading TS errors on the first admin.ts paste. Workaround: search for `Promise\n` after pasting and verify `<` follows.
- Production push_subscriptions had no user_id or membership_id column. Required additive migration to support mute.
- AppShell was originally a client component importing UserMenu (which transitively imports server code), broke the build. Fixed by passing UserMenu as a React.ReactNode prop from layout.tsx.

### Mute UI lessons learned
- Watch out: schema changes in prod by mistake. Always confirm "is this dev or prod?" before running SQL from any AI suggestion. The first migration in this work ran against prod unintentionally; the additive ALTER TABLE was harmless but a `DELETE FROM push_subscriptions` was nearly run against prod the same way.
- Subscriptions created before the migration have membership_id=null. The filter logic treats null as "no mute info, send anyway" — graceful degradation but not retroactive.
- Anti-flicker on mute toggle: load state must complete before rendering the button, otherwise it briefly shows the default before updating.

### Realtime reactions lessons learned
- team_message_reactions has no team_id column. Subscription filter on team_id isn't possible. Subscribing globally is fine for current scale; add team_id column if scale grows.
- Debounce timer must clear on unmount to avoid setState-after-unmount warnings.
- The "burst test" for debounce is hard to do manually because reaction UI involves tapping a message to open a menu, picking emoji, picker closes. By the time you can tap again, debounce window may have already closed. Delete-reaction is the easier burst test.

## RLS test harness (in on-deck-dev only)

5 fake user UUIDs seeded into on-deck-dev for testing RLS policies. The `memberships.user_id` FK to `auth.users` is dropped in dev to allow these fake user IDs. The `memberships.approved_by` FK is NOT dropped — workaround is to omit approved_by in dev tests.

### Fake users in on-deck-dev

| User ID                              | Org                | Role        | Status   | Notes                          |
|--------------------------------------|--------------------|-------------|----------|--------------------------------|
| 11111111-1111-1111-1111-111111111111 | chicago-elite      | org_admin   | approved | User A                         |
| 22222222-2222-2222-2222-222222222222 | northside-knights  | org_admin   | approved | User B                         |
| 33333333-3333-3333-3333-333333333333 | chicago-elite      | parent      | approved | User C — linked to Moore       |
| 44444444-4444-4444-4444-444444444444 | chicago-elite      | parent      | pending  | User D — Daniel Davis (profile backfilled). For approval queue testing.|
| 55555555-5555-5555-5555-555555555555 | chicago-elite      | team_admin  | approved | User E — scoped to Moore only  |

User C is linked to Moore via parent_teams.

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

### Cutover (next up)
Enable RLS on 17 tenant tables in prod. Test app behavior per-table. Major architectural milestone — multi-tenant story is real only after this.

### Admin manage-members UI
After Chunk H, parents come in via signup but admins can't yet edit their team assignments, change their default team, or remove them post-approval without SQL. Build a "Members" tab in /admin that lists all approved memberships and lets admins edit assignments.

### Email notifications
On approval (so the parent doesn't need PendingChecker to catch it), on team_admin invitation, on game status changes. Requires SMTP provider (Resend recommended). Multi-hour rabbit hole — defer until needed.

### DMs
1:1 conversations between team members. Highest moderation complexity — needs blocking, muting, read receipts. Reuses ~80% of chat plumbing (schema, storage, RLS, push helper).

### Batting order in stats
player_stats.batting_order_position (integer, nullable). Display by batting_order_position NULLS LAST, jersey_number. Effort: medium — schema change trivial, lineup-entry UI is the real work.

### Chat features deferred to v2
- @mentions / notification on mention
- Read receipts
- Typing indicators
- Time-based mute (mute for X hours) — would need separate chat_mutes table or jsonb column
- Admin moderation override on delete
- Edit messages
- Message search
- Pinned messages

### Magic link or email/password signup
Currently Google OAuth only. Some parents won't have Google. Adding email/password or magic link is a multi-hour change but increases reach.