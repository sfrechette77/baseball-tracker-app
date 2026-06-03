# On Deck — Design Notes

## Next session starts here

**Multi-tenant is live with a real second tenant.** Florida Vandals exists in prod with its own org_admin login, isolated teams, and orange branding. Per-org theming works.

**Recently completed (this session):**
- ✅ Team picker is now DB-driven (was hardcoded `teams.ts`). Loads by role: org_admin → org's own teams (`is_opponent=false`); parent/team_admin → assigned teams via `parent_teams`/`team_admins`. Loading gate added; header null-guarded.
- ✅ `teams.is_opponent` flag (prod + dev) — separates the 15 league opponent teams (all carry Elite's org_id) from own teams (Moore, Ayeski).
- ✅ Florida Vandals bootstrapped — prod org (first real second tenant) + dev org (renamed from Northside Knights).
- ✅ Per-org brand color: `--brand` CSS var (set from `organizations.primary_color`) + Tailwind red-palette remap. Elite red, Vandals orange.
- ✅ Box score fix — 0-AB players with a `batting_order_position` now show (`battingRows` built from `playerStats`, not `playersWithStats`).

**Active items (pick one):**
1. **layout.tsx branding** — tab title, manifest, icons still hardcoded "Chicago Elite 11U" for every org. Make metadata org-aware for a true per-org PWA.
2. **teams.ts cleanup** — `PICKABLE_TEAMS`/`DEFAULT_TEAM_ID` are dead code now (only the `PickableTeam` type is still imported).
3. Admin invite team_admin role (carried over).
4. Email notifications on approval (carried over).
5. (debt) Standardize the service-key env var name.

**Recently completed:**
- ✅ **Tournament box score bug** — fixed. Root cause was app-side: for tournaments the opponent box_score row shares Elite's `team_season_id` and is distinguished by `team_id = null`, so the old `themRow` finder (matching on differing team_season_id) returned undefined. Fixed by matching the "us" row on `team_id === event.team_id` and taking the other row as "them".
- ✅ **Chunk 4b** — dropped `fields.team_id` (the last redundant legacy column) in dev and prod. All other per-season `team_id` columns were already dropped in Chunk 3.
- ✅ **Admin manage-members UI** — Members tab in /admin.
- ✅ **Signup RLS fix** — public signup routes broke after the cutover (anonymous/new-user reads of `organizations` blocked by RLS). Fixed via a service-role client.
- ✅ **Batting order** — `player_stats.batting_order_position` (dev + prod), admin "Bat #" entry, event-page Batting table sorted by it.

**Active items (pick one):**

1. **Admin invite team_admin role.** Currently no UI to add a team_admin (assistant coach) — they'd come in via Chunk H as a parent and need SQL surgery. Build a small invite-by-email flow that skips pending.

2. **Email notifications on approval.** PendingChecker re-check on focus works, but parents would benefit from an email saying "you're approved" instead of refreshing on hope.

---

## Where we are now

**Phase status:**
- ✅ Schema migration complete (Chunks 0-8 deployed to prod)
- ✅ All 7 app pages migrated to team_season_id (Chunks A-G)
- ✅ BottomNav extracted to shared component
- ✅ Team page built — consolidates Standings + Results + Roster sub-views
- ✅ MSBL Rules moved to dedicated /team/rules route
- ✅ Feed v1 fully shipped
- ✅ Chat v1 fully shipped (schema + actions + UI + realtime + push)
- ✅ Messages page consolidates Feed + Chat under one nav button
- ✅ Skeleton loaders replaced spinning baseball across all pages
- ✅ Chunk H shipped — Signup + admin approval flow with Google OAuth
- ✅ Mute UI shipped — users can mute chat push notifications per team
- ✅ Realtime reactions sync shipped — reactions update across devices with 2s debounce
- ✅ **Cutover COMPLETE — all 17 tenant tables under RLS in production**
- ✅ Tournament box score bug fixed (app-side opponent-row finder)
- ✅ Chunk 4b — `fields.team_id` dropped (last redundant legacy column)
- ✅ Admin manage-members UI shipped — Members tab in /admin
- ✅ Signup RLS fix — service-role client for pre-auth routes

## Key identifiers (DO NOT LOSE)

- **Chicago Elite org UUID (prod):** `75c11f73-5394-4ffc-bf39-9c708418e07b`
- **Chicago Elite org UUID (dev):** `25c71684-dcdb-4ccc-9e8b-4f4357c3b8ee`
- **Northside Knights org UUID (dev, for cross-tenant tests):** `6cadb1e5-905d-4dee-9d62-46cb7d4f2b62`
- **Steve's auth.users.id:** `6c87af4c-8e23-45ad-8453-6530116b3deb`
- **Steve's membership_id** (org_admin, Chicago Elite): `7cbfaaa5-e502-4f5f-a576-a0dbd668cf98`
- **Moore team UUID:** `4beb0750-1883-4b56-a386-db280675036c`
- **Ayeski team UUID:** `0c8cc8d0-2398-41c2-8ba0-036d62ee13a6`
- **Florida Vandals org UUID (prod):** `4801e4d4-bc14-410f-8b00-62b27e6827ef` (slug `florida-vandals`; admin `frechettegaming22@gmail.com`)
- **Florida Vandals org UUID (dev):** `6cadb1e5-905d-4dee-9d62-46cb7d4f2b62` (renamed from Northside Knights; still User B's org for cross-tenant tests)
- **Dev project ref:** `gpsqykddcubponpbwule`

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
- getMutedChats, toggleMuteChat
- Uses getCurrentMembershipForTeam helper that picks highest-priority role when user has multiple memberships (org_admin > team_admin > parent)
- deleteMessage uses 0-rows-affected check to catch silent RLS failures
- Push notification fires after sendMessage. Tag is per-team (`team-chat-${teamId}`) so newest message replaces older on iOS lock screens.

### UI
- components/chat/{MessageReactionBar, MessageBubble, MessageComposer}.tsx
- Rendered inside /messages?view=chat
- MessageBubble: own messages right-aligned red, others left-aligned with avatar/initials. Tap bubble for React/Delete actions.
- MessageComposer: text + image picker + send button. Enter sends, Shift+Enter newline. Auto-resizing textarea (max 120px).
- Author grouping: consecutive messages from same author within 5 minutes share one avatar/timestamp header.
- Mute toggle at top right of chat tab (🔔 Notifications on / 🔕 Muted) — flips memberships.muted_chats for current team.
- Anti-flicker: mute toggle hidden until server confirms initial state.

### Realtime
- Subscribed to team_messages INSERT/DELETE for instant message sync.
- Subscribed to team_message_reactions INSERT/DELETE with 2-second debounce on refetch (prevents spam when multiple users react in quick succession).
- Reaction subscription is global (no team_id filter — team_message_reactions has no team_id column).

### Reusable push helper (lib/push/send.ts)
- sendPushToTeam(teamId, payload)
- Joins push_subscriptions → memberships to skip subscribers who have muted this team's chat
- Subscriptions without membership_id (legacy/no link) pass through unfiltered
- Used by both Feed createPost and Chat sendMessage

## /messages page

- Combined home for Feed + Chat
- Sub-tabs at top: Announcements | Chat (URL search param `?view=`)
- Defaults to Announcements
- Bottom nav: Home | Schedule | Team | Stats | **Messages** (chat-bubble icon, replaced Feed)
- /feed route redirects to /messages?view=announcements

## Chunk H — Signup + Admin Approval — SHIPPED

Scope: org-scoped self-registration for parents, admin approval queue with team assignment.

### Signup flow
- /o/[slug]/signup — public Server Component route, validates slug exists (org lookup now uses the service-role client — see "Signup RLS fix")
- SignupForm.tsx — client component, "Sign up with Google" button, uses signInWithOAuth with redirectTo /auth/callback?next=/o/[slug]/signup/complete
- /o/[slug]/signup/complete — Server Component that runs after OAuth callback. Creates/upserts profile, creates pending membership (status='pending', role='parent', organization_id=org). Org lookup + profile/membership writes use the service-role client (see "Signup RLS fix"); user session read with the authenticated client.
- Shows "You're almost in" pending screen with user email + sign-out button
- PendingChecker.tsx — embedded client component that polls on mount + on window focus. When user is approved, redirects to /. No periodic polling.

### Public route handling
- middleware.ts whitelists /o/[slug]/signup and /o/[slug]/signup/complete (regex match)
- AppShell component (components/app-shell.tsx) hides the global Header on pre-auth routes. Renders just `<main>{children}</main>` for those.
- Public routes are duplicated in both middleware.ts AND app-shell.tsx — must stay in sync if changing.

### Admin approval
- /admin Pending tab (7th tab)
- app/actions/admin.ts — Server Actions: getPendingMemberships, getOrgTeams, approveMembership
- requireOrgAdmin() helper guards each action
- approveMembership validates target membership belongs to admin's org, validates all team IDs belong to admin's org, flips status to approved, creates parent_teams rows, marks one as default
- UI: per-row Approve button → modal with team checkboxes (defaulting to all checked) + "default team" radio.

## Admin Manage-Members UI — SHIPPED

Scope: org_admins can view approved parents and manage their team assignments / remove them, all in-app (previously SQL-only).

### UI
- /admin **Members** tab (8th tab, next to Pending). Tabs grid widened to accommodate.
- Lists approved **parents only** (org_admins and team_admins excluded).
- Per member card: name, email, assigned teams with the default marked by ★.
- **Edit Teams** → inline panel with team checkboxes + default radio (same UX as the approval flow). Replaces all parent_teams rows.
- **Remove** → confirm step → deletes the membership row (cascades to parent_teams). Parents only.

### Server Actions (app/actions/admin.ts)
- getApprovedParents — approved parent memberships in the admin's org, joined to profiles (name/email) and parent_teams (teams + default flag).
- updateMemberTeams(membershipId, teamIds, defaultTeamId) — validates org + team ownership, deletes existing parent_teams rows, re-inserts with exactly one default.
- removeMembership(membershipId) — validates org ownership + parent role, deletes the membership.
- All three reuse the existing requireOrgAdmin() guard.

### Decisions
- Remove = hard delete of the membership row (not a status flip to rejected).
- Members tab scoped to parents only (team_admins managed elsewhere / future invite flow).
- Modal/inline edit pattern mirrors approval flow for consistency.

## Signup RLS fix — SHIPPED (production bug)

The cutover broke public signup. Symptom: /o/chicago-elite/signup returned 404 (then 500 after partial fixes); no new parent could register.

### Root cause
- The public signup routes read the `organizations` table to validate the slug. Post-cutover, the SELECT policy is `id IN current_user_org_ids()`. An anonymous visitor — or a brand-new authenticated user with no memberships yet — gets an empty set, so the org lookup returns null and the route 404s / redirects.
- The /complete route had a second instance: it upserts into `profiles`, which has **no INSERT policy** under RLS, so the write would fail for a new user.

### Fix
- New `lib/supabase/service.ts` — service-role Supabase client (bypasses RLS). Server-only; never import into client code.
- `app/o/[slug]/signup/page.tsx` — org slug lookup now uses the service client.
- `app/o/[slug]/signup/complete/page.tsx` — service client for the org lookup + profiles upsert + memberships insert/select. The **user session** is still read with the normal authenticated client (createClient → supabase.auth.getUser()); only the DB work uses the service client.
- New env var **`SUPABASE_SERVICE_ROLE_KEY`** added to Vercel (Production) and local .env.local.

### Rule going forward
Any **pre-auth or new-user server route** that touches tenant tables must use the service client, because RLS will block it (visitor has no membership yet; profiles has no INSERT policy). Reads/writes after the user is an approved member can use the authenticated client as usual.

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

## Cutover — SHIPPED (all 17 tables under RLS)

Goal: enable RLS on every tenant table so the database enforces multi-tenant isolation, not just application code.

### What changed
For each of these 17 tables, ran `alter table public.<name> enable row level security`. All policies were already created during Chunk 8 and dormant. Cutover = flipping the master switch.

### Batches and order
- **Batch 1** (lowest risk, infrastructure-ish): fields, weather_forecasts, event_imports, game_status_log
- **Batch 2** (core read tables): teams, team_seasons, players, events
- **Batch 3** (tenant data with writes): box_scores, player_stats, league_games, standings
- **Batch 4** (control plane, circular deps with helpers): organizations, seasons, team_admins, parent_teams, memberships (memberships last because every helper function reads from it)

### Validation method
For each batch:
1. **Audit policies in dev** — list every policy, read the `using` and `with_check` expressions carefully.
2. **Flip RLS in dev** — `alter table ... enable row level security`.
3. **Impersonation tests in dev** using the fake user UUIDs:
   - User C (parent in chicago-elite, linked to Moore) sees expected counts
   - User B (org_admin in northside-knights, different org) sees ZERO chicago-elite data
   - Helper functions (`current_user_org_ids`, `is_org_admin`, `can_read_team`, `can_admin_team`) return correct results
4. **Verify base data with superuser** — if a count is 0, confirm whether it's an RLS filter or sparse seed data.
5. **Sanity check policies in prod** — read prod's policy expressions, compare to dev's. Policy names sometimes differed (e.g., "Org admins" vs "org_admins") but expressions matched.
6. **Flip prod one table at a time** with manual app testing between each.

### Key insight: SECURITY DEFINER helpers survive RLS
The four helper functions (`current_user_org_ids`, `is_org_admin`, `can_read_team`, `can_admin_team_season`) are defined with `SECURITY DEFINER`, which means they execute as the function owner — bypassing the caller's RLS. This is what makes the cutover safe even on `memberships`: the helpers can see all the membership rows they need to evaluate permissions, even when the caller's view is RLS-restricted.

### Bugs/observations found during cutover
- **Tournament box scores bug** (logged separately): on a tournament game in prod, the line score shows only Elite's row, not the opponent's. Diagnosed during Batch 3 by toggling box_scores RLS off — bug persisted with RLS off, so it's NOT RLS-caused. Pre-existing data issue. **Now FIXED (app-side) — see "Tournament box scores fix" near the bottom.**
- **fields has NOT NULL team_id**: discovered when trying a synthetic INSERT during dev validation. Legacy from pre-multi-tenant schema. Not blocking cutover. Will be cleaned up in Chunk 4b.
- **Empty-table check**: in dev, several tables had 0 rows (event_imports, weather_forecasts, box_scores, etc). Always verified with superuser SELECT to distinguish "RLS filtered everything" from "table is just empty". Important habit.
- **Prod policy names ≠ dev policy names** for some tables (case + naming convention differences) but the policy expressions matched. Verify expressions, not names.

### Cron / service-key safety
Before flipping RLS on `weather_forecasts`, `event_imports`, `game_status_log`, verified that all writes go through `SUPABASE_SERVICE_ROLE_KEY` paths (cron job in `/api/update-weather`, admin route in `/api/admin`). Service key bypasses RLS entirely, so cron stays unaffected.

### Cross-tenant test seed in dev
Northside Knights is seeded in dev with 1 team + 1 team_season + 4 players + 1 event + 1 league_game. This lets us prove cross-tenant isolation by impersonating User B (NK org_admin) and confirming they see ONLY northside-knights data, never chicago-elite.

## Context

Converting baseball-tracker-app from a single-tenant app (Chicago Elite) into a multi-tenant SaaS where multiple youth baseball organizations can each have their own branded experience. Validated demand. Committed to building.

## Schema

See SCHEMA.md for current state of tables, columns, constraints, and RLS policies. RLS is now ON across all 17 tenant tables in production.

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
- Admin approval: org_admin opens /admin → Pending tab. Per-row Approve → modal with team checkboxes + default-team radio.
- Default landing: when a parent logs in after approval, they land on their default team. They can switch to any other team they're linked to via parent_teams.
- Auth provider: Google OAuth only in v1.
- No reject UI in v1. To deny a parent, admin deletes the membership row directly via SQL (rare case).
- No email notification on approval. PendingChecker re-checks on focus so parent's pending screen auto-redirects.

## Team picker (DB-driven) + per-org theming — SHIPPED

### Team picker
- `team-context.tsx` no longer reads `teams.ts`. On mount it loads the user's approved memberships, then:
- org_admin → `teams` where `organization_id = org AND is_opponent = false`
- parent / team_admin → teams via `parent_teams` + `team_admins` (merged, deduped)
- Default selection: saved localStorage choice → parent's `is_default` → first team.
- Provider holds a loading spinner until teams resolve, so no team-scoped page mounts without a team. Public `currentTeam` stays non-null (no page-consumer edits); header  guards the logged-out/pending/no-team null.

### is_opponent
- `teams.is_opponent` (boolean, NOT NULL, default false). `true` = league opponent that shares the org_id but isn't fielded by the org. Excluded from the picker. Prod: 15 opponents flagged true, Moore/Ayeski false.

### Per-org theming
- `organizations.primary_color` drives the UI accent via a runtime `--brand` CSS variable (set in `org-context`).
- `globals.css` remaps Tailwind's `--color-red-*` scale to `--brand` via `color-mix`, so all existing `red-*` utilities follow the org color with zero component edits.
- Elite `primary_color` = `#dc2626`; Vandals = `#F97316`. New orgs must set `primary_color` at creation or they fall back to the red default.
- Caveat: "danger/delete" reds are org-tinted too (accepted).

## Admin roles

- Org admin: can do anything in the org — manage all teams, approve parents, change brand/settings, invite other admins.
- Team admin: scoped to specific team(s). Can manage events, post updates, and send notifications for those teams only.

## Routing

- Path-based: org-scoped pre-auth pages under /o/{slug}/... (currently just signup; full /o/{slug}/[everything else] routing deferred)
- Non-org pages at root: /login, /account, etc.
- Middleware enforces: not-public route → must be logged in. Org-scoped post-auth middleware deferred.

## Decisions made

- Multi-tenant via organizations table (not per-fork)
- One user belongs to one org (no multi-org users)
- One user can hold multiple roles in their org (parent + team_admin common)
- Self-registration with admin approval gate (shipped)
- Admin assigns team(s) at approval time (shipped)
- Parents land on default team, can browse others
- Two admin tiers: org_admin and team_admin
- Brand strings and colors stored on the organizations record
- Logo files will live in Supabase Storage; logo_url field stores URL
- Pattern C for season handling: permanent teams + per-season instances
- Season rollover is an admin action (not automatic) — once per year per org
- Old seasons preserved, queryable, but not the default view
- Approval workflow: pending → approved is for self-registration. Admin-initiated role grants skip pending.
- Routing: path-based (/o/{slug}/...). Subdomain routing deferred to post-revenue.
- Per-season tables link to team_seasons. Permanent team_id dropped post-cutover (Chunk 4b).
- team_admins and parent_teams link to teams (permanent), not team_seasons
- Membership modeling: one row per role
- Enum named `membership_role`
- Feature flags as boolean columns initially
- Cascade deletes from organizations → seasons/memberships; SET NULL on audit fields
- League opponent teams: all 17 existing teams have organization_id = Chicago Elite. Will revisit when a second league-running org signs up.
- Feed and Chat attach to permanent team_id. Parents lose access when removed from parent_teams.
- Chat hard delete only — chat is ephemeral.
- Chat reactions realtime sync via debounced refetch (2s debounce).
- Chat mute: per-membership via memberships.muted_chats uuid[]. Indefinite (on/off, no time-based).
- Auth provider for signup: Google OAuth only in v1.
- **RLS is on for all 17 tenant tables in prod.** Database enforces isolation.
- Helpers use SECURITY DEFINER so they bypass RLS internally — critical for memberships RLS to be safe.
- **Pre-auth / new-user server routes use a service-role client** (lib/supabase/service.ts) for any tenant-table access, because RLS blocks visitors with no membership yet (and profiles has no INSERT policy). Authenticated client still used for the user session.
- Admin Members tab: Remove = hard delete of membership (not status flip); scoped to parents only.
- Batting order: stored on `player_stats.batting_order_position` (per-game, nullable). Display sort = batting_order_position NULLS LAST → jersey_number → name.
- **Env var name wart:** `/api/admin/route.ts` reads `SUPABASE_SERVICE_ROLE_KEY`; the signup fix reads `SUPABASE_SERVICE_ROLE_KEY`. Both hold the same prod service_role key. `.env.local` and Vercel must carry BOTH names until standardized. (Cleanup: pick one name, update both call sites + envs.)
- Team picker is DB-driven and role-scoped; org_admin sees own teams only (`is_opponent=false`), never league opponents.
- `teams.is_opponent` distinguishes own teams from league opponents sharing the org_id.
- Brand accent = `organizations.primary_color` via runtime `--brand`; Tailwind red palette remapped to it. New orgs set `primary_color` at creation.
- One-user-one-org enforced in practice during bootstrap: a new org's admin must use a different Google account than any existing org.

## Parked / explicitly out of scope (for now)

- Stripe billing and subscription management — Phase 4
- Marketing site, free-to-paid conversion — Phase 5
- Multi-org users (one person in multiple orgs) — rejected
- Per-player parent linking — rejected
- Subdomain routing and custom domains — deferred
- Migration from Pattern C to anything more complex — defer until needed
- Cross-org league play / shared opponent rosters — deferred
- Batting order in stats (deferred — needs batting_order_position column)
- Edit message UI — schema supports it but no UI in v1
- Admin moderation of chat messages — v1 only allows author to delete their own
- Email-based signup or magic link — Google OAuth only in v1
- Reject button in admin pending queue — manual SQL workaround for now
- Email notifications on approval — PendingChecker re-check pattern instead

## Production migration log (condensed)

### Critical fix: RLS was already ON in production (Chunk 8d era)
- After dropping permissive policies, prod broke because RLS was actually enabled on 7 tables that had been masked by qual=true SELECT policies.
- Resolution: disabled RLS on those 7 tables. Policies still exist — dormant until cutover.

### Weather forecasts gotcha (Chunk 3 era)
- weather_forecasts rebuilt periodically by `/api/update-weather` cron. Chunk 3 backfill got wiped between runs.
- Fix pattern: set column default FIRST, then backfill, then NOT NULL.

### Migration progress (all complete)
- Chunk 0–8: schema migration to multi-tenant
- Chunks A–G: app pages migrated to team_season_id
- Team page rebuild: Standings + Results + Roster sub-views, MSBL Rules to /team/rules
- Feed v1: schema + actions + UI + push + skeleton loaders
- Chat v1: schema + actions + UI + realtime + push + mute + realtime reactions
- Chunk H: signup + admin approval flow
- **Cutover: RLS enabled on all 17 tenant tables in prod**
- ✅ Chunk 4b — dropped `fields.team_id` (dev + prod); all other per-season team_id columns already dropped in Chunk 3
- ✅ Admin manage-members UI — Members tab in /admin
- ✅ Signup RLS fix — service-role client for pre-auth routes (lib/supabase/service.ts); `SUPABASE_SERVICE_ROLE_KEY` added to Vercel + .env.local
- ✅ Batting order — `player_stats.batting_order_position` (dev + prod); admin entry + sorted display

### Pre-prod cleanup
Before any new prod customer, fake memberships in dev (UUIDs 1111..., 2222..., etc.) should NOT be carried over.

### Feed v1 lessons learned
- Server Actions need `allowedOrigins` in next.config.ts for Codespace dev URL
- Soft delete with RLS requires SELECT policy to allow admins to see their own deleted rows
- next.config.ts is only read at startup
- useSearchParams() in 'use client' components requires Suspense wrapper for production build
- Discriminated unions narrow correctly; the `'error' in ctx` pattern does NOT narrow optional fields
- PostgREST joins through auth.users don't work via schema cache; query profiles separately and merge

### Chat v1 lessons learned
- can_read_team helper was missing in dev. Created it before chat schema would land.
- Default org_id on new tables references prod UUID; in dev had to ALTER COLUMN SET DEFAULT to dev's Chicago Elite UUID.
- Storage bucket must be created via Supabase dashboard UI, then RLS policies applied separately.
- Realtime publication needs `alter publication supabase_realtime add table public.X` per table.
- Chat layout: composer must be `fixed bottom-0` above the bottom nav.

### Chunk H lessons learned
- memberships.approved_by has FK to auth.users that rejects fake test UUIDs in dev. Tests skip setting approved_by.
- Long-block paste from chat into Codespaces editor sometimes drops `<` characters right before newlines — caused 95 cascading TS errors. Workaround: search for `Promise\n` after pasting.
- Production push_subscriptions had no user_id or membership_id column. Required additive migration to support mute.
- AppShell was originally a client component importing UserMenu (which transitively imports server code), broke the build. Fixed by passing UserMenu as a React.ReactNode prop from layout.tsx.

### Mute UI lessons learned
- Watch out: schema changes in prod by mistake. Always confirm "is this dev or prod?" before running SQL. A nearly-fatal `DELETE FROM push_subscriptions` was caught just in time.
- Subscriptions created before the migration have membership_id=null. Filter logic treats null as "no mute info, send anyway" — graceful degradation, not retroactive.
- Anti-flicker on mute toggle: load state must complete before rendering the button.

### Realtime reactions lessons learned
- team_message_reactions has no team_id column. Subscription filter on team_id isn't possible. Subscribing globally is fine for current scale.
- Debounce timer must clear on unmount to avoid setState-after-unmount warnings.
- "Burst test" for debounce is hard to do manually because reaction UI takes time to open the picker. Delete-reaction is the easier burst test.

### Chunk 4b lessons learned
- Only `fields.team_id` actually remained — the rest were dropped in Chunk 3. Verify column existence with an information_schema query before writing DROP statements; don't assume the design doc's "to drop" list is still accurate.

### Signup RLS fix lessons learned
- **The cutover silently broke public signup.** Pre-auth routes that read tenant tables (here: `organizations` for slug validation) fail under RLS because the visitor has no membership → `current_user_org_ids()` is empty. Symptom was a 404, not an obvious permission error.
- **profiles has no INSERT policy** — the /complete route's profile upsert also needed the service client, not just the org lookup.
- The fix is a dedicated service-role client (lib/supabase/service.ts). Keep it server-only; it bypasses RLS entirely.
- `SUPABASE_SERVICE_ROLE_KEY` must be set in **both** local .env.local and Vercel, scoped to **Production**. A missing/mis-scoped var throws "Missing Supabase service env vars" at runtime (shows as a server-side exception with a digest; check Vercel Runtime Logs for the real message).
- **OAuth flows can't be tested from Codespaces.** The Google sign-in page loads, but the redirect back resolves to a wrong/unreachable address (`…-3000.app.github.dev:3000`). Test all login/signup flows on the deployed prod site.
- **Dev project has no real auth.users** — all dev memberships use the fake test UUIDs, which can't log in. Anything behind requireOrgAdmin() can't be exercised in dev via real login; test those on prod.
- `.env.local` env-swap workflow: back up prod values (`cp .env.local .env.local.prod.bak`) before pointing local at dev; restore with `cp .env.local.prod.bak .env.local`. Keep local on prod by default.

### Batting order lessons learned
- **Two different service-key env var names exist.** `/api/admin/route.ts` reads `SUPABASE_SERVICE_ROLE_KEY`; `lib/supabase/service.ts` (signup fix) reads `SUPABASE_SERVICE_ROLE_KEY`. Same value, two names. Stats-saving silently 500'd locally until `SUPABASE_SERVICE_ROLE_KEY` was added to `.env.local` (it had only the `_ROLE_` name). Both names must be present in `.env.local` AND Vercel until standardized.
- **"Unexpected end of JSON input" on a fetch = the API route threw before returning** (empty body, not valid JSON). The real error is in the **dev terminal**, not the browser console.
- **Local app points at prod** (per `.env.local`), so a new column must exist in **prod** to test the save locally — adding it only to dev isn't enough when local is pointed at prod.
- Multi-edit changes: verify each edit actually landed. The display sort failed only because edit #4 (swap `playersWithStats.filter(...)` → `battingRows`) silently didn't apply; grep confirmed it.

### Cutover lessons learned
- **Order matters.** Leaf tables first, then dependents, then the foundational table (memberships) last. If memberships breaks, every other policy breaks too.
- **Read every policy expression before flipping.** Policy names differed between dev and prod for some tables; expressions matched. Trust expressions, not names.
- **Distinguish "filtered to 0" from "actually 0".** When a SELECT returned 0 rows under impersonation, always re-run as superuser to confirm the underlying data really was sparse, not RLS-hidden.
- **SECURITY DEFINER is what makes memberships RLS safe.** The helper functions read membership rows internally with elevated privileges; they don't depend on the caller's view of the table.
- **Pre-existing data bugs surface during validation.** The tournament box score issue was found by carefully testing every page after Batch 3, but the bug pre-dated RLS.
- **Cron and admin routes use service key.** Verified before flipping RLS on tables those routes write to. Service key bypasses RLS entirely.
- **Test on prod after every flip.** Even when dev validated cleanly, the prod test caught one issue (tournament box scores) that we then diagnosed and ruled out as RLS-caused.

### Per-org theming + picker lessons learned
- org_admin "all teams in org" pulled in 15 league opponent teams (all carry Elite's org_id — the documented wart). Fixed with `is_opponent`. Season-scoping did NOT work: opponents have current-season `team_seasons` (for standings).
- Kept `currentTeam` non-null in the public type to avoid editing every page consumer; gate rendering on a loading state instead, and null-guard only the header.
- Tailwind v4 `red-*` utilities resolve to `var(--color-red-*)`; override those vars to retint globally — no need to touch the ~220 usages.
- `color-mix()` fails silently on a blank `--brand` → reds render with no color → invisible UI. `??` doesn't catch an empty string; guard with `.trim()`.
- Elite's `primary_color` was `#0f172a` (the PWA `themeColor`), unused until `--brand` wired it — which broke the UI. Corrected to `#dc2626`.
- **Codespaces free tier ran out mid-session → use github.dev** (browser editor, no compute meter). Search panel replaces `grep`; commit+push triggers the Vercel deploy. Same paste-`<`-drop gotcha applies.
- **New-prod-org bootstrap recipe:** create the `organizations` row (so the slug resolves) → admin signs up their Google account at `/o/{slug}/signup` (creates auth user + pending parent) → SQL: insert approved `org_admin` membership, delete the pending parent, create teams + a current season + team_seasons.

## RLS test harness (in on-deck-dev only)

5 fake user UUIDs seeded into on-deck-dev for testing RLS policies. The `memberships.user_id` FK to `auth.users` is dropped in dev. The `memberships.approved_by` FK is NOT dropped — workaround is to omit approved_by in dev tests.

### Fake users in on-deck-dev

| User ID                              | Org                | Role        | Status   | Notes                          |
|--------------------------------------|--------------------|-------------|----------|--------------------------------|
| 11111111-1111-1111-1111-111111111111 | chicago-elite      | org_admin   | approved | User A                         |
| 22222222-2222-2222-2222-222222222222 | northside-knights  | org_admin   | approved | User B — used for cross-tenant tests |
| 33333333-3333-3333-3333-333333333333 | chicago-elite      | parent      | approved | User C — linked to Moore       |
| 44444444-4444-4444-4444-444444444444 | chicago-elite      | parent      | pending  | User D — Daniel Davis (profile backfilled). For approval queue testing.|
| 55555555-5555-5555-5555-555555555555 | chicago-elite      | team_admin  | approved | User E — scoped to Moore only  |

User C is linked to Moore via parent_teams.
Northside Knights is seeded with 1 team + 1 team_season + 4 players + 1 event + 1 league_game for cross-tenant testing.

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

### Admin manage-members UI — ✅ SHIPPED
See "Admin Manage-Members UI — SHIPPED" above. Members tab in /admin: lists approved parents, edit team assignments + default, remove (hard delete). Actions: getApprovedParents, updateMemberTeams, removeMembership.

### Email notifications
On approval, on team_admin invitation, on game status changes. Requires SMTP provider (Resend recommended). Multi-hour rabbit hole — defer until needed.

### DMs
1:1 conversations between team members. Highest moderation complexity — needs blocking, muting, read receipts. Reuses ~80% of chat plumbing (schema, storage, RLS, push helper).

### Batting order in stats — ✅ SHIPPED
`player_stats.batting_order_position` (smallint, nullable) added to dev + prod. Admin Stats tab has a "Bat #" input per player (persists via `/api/admin` update_player_stats → `battingOrderPosition`). Event page Batting table sorts by `batting_order_position` (NULLS LAST), then jersey_number, then name. Sort lives in `battingRows` in `app/event/[id]/page.tsx`.

### Chat features deferred to v2
- @mentions / notification on mention
- Read receipts
- Typing indicators
- Time-based mute
- Admin moderation override on delete
- Edit messages
- Message search
- Pinned messages

### Magic link or email/password signup
Currently Google OAuth only. Adding email/password or magic link increases reach.

### Tournament box scores fix — ✅ FIXED (prior session)
Was: line score for tournament games showed only Elite's row. Root cause was app-side, not data/RLS: for tournaments the opponent box_score row shares Elite's `team_season_id` (the opponent isn't a `teams` row — just text on `events.opponent`) and is distinguished by `team_id = null`. The old finder `boxScores.find(r => r.team_season_id !== event.team_season_id)` returned undefined. Fixed in `app/event/[id]/page.tsx`: find the "us" row by `team_id === event.team_id`, take the other row as "them". Also switched header label to the short `pickable?.label` and widened the team column to `max-w-[180px]` for long opponent names.
