'use server'

import { createClient } from '@/lib/supabase/server'

export type DashboardEvent = {
  id: string
  title: string | null
  opponent: string | null
  event_type: string | null
  starts_at: string
  team_id: string | null
  team_name: string | null
  field_id: string | null
  field_name: string | null
}

export type DashboardTeamAdminAssignment = {
  team_id: string
  membership_id: string
  user_id: string
  full_name: string | null
  email: string | null
}

async function requireOrgAdmin(): Promise<
  | { ok: true; membership: { organization_id: string } }
  | { ok: false; error: string }
> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, error: 'Not authenticated' }

  const { data: memberships, error: memError } = await supabase
    .from('memberships')
    .select('id, organization_id, role, status')
    .eq('user_id', user.id)
    .eq('role', 'org_admin')
    .eq('status', 'approved')
    .limit(1)

  if (memError) return { ok: false, error: memError.message }
  if (!memberships || memberships.length === 0) {
    return { ok: false, error: 'Not an org admin' }
  }

  return {
    ok: true,
    membership: { organization_id: memberships[0].organization_id },
  }
}

export async function getDashboardPlayerCount(): Promise<
  { ok: true; playerCount: number } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { count, error } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', guard.membership.organization_id)

  if (error) return { ok: false, error: error.message }

  return { ok: true, playerCount: count ?? 0 }
}

export async function getDashboardThisWeek(): Promise<
  { ok: true; events: DashboardEvent[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  const { data, error } = await supabase
    .from('events')
    .select(`
      id,
      title,
      opponent,
      event_type,
      starts_at,
      team_id,
      field_id,
      teams:team_id (
        name
      ),
      fields:field_id (
        name
      )
    `)
    .eq('organization_id', guard.membership.organization_id)
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .order('starts_at', { ascending: true })

  if (error) return { ok: false, error: error.message }

  const events: DashboardEvent[] = (data ?? []).map((event: any) => ({
    id: event.id,
    title: event.title,
    opponent: event.opponent,
    event_type: event.event_type,
    starts_at: event.starts_at,
    team_id: event.team_id,
    team_name: Array.isArray(event.teams) ? event.teams[0]?.name ?? null : event.teams?.name ?? null,
    field_id: event.field_id,
    field_name: Array.isArray(event.fields) ? event.fields[0]?.name ?? null : event.fields?.name ?? null,
  }))

  return { ok: true, events }
}

export async function getDashboardTeamAdminAssignments(): Promise<
  { ok: true; assignments: DashboardTeamAdminAssignment[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: rows, error } = await supabase
    .from('team_admins')
    .select(`
      membership_id,
      team_id,
      memberships!inner (
        id,
        user_id,
        organization_id
      )
    `)
    .eq('memberships.organization_id', guard.membership.organization_id)

  if (error) return { ok: false, error: error.message }

  const normalized = (rows ?? []).map((row: any) => {
    const membership = Array.isArray(row.memberships) ? row.memberships[0] : row.memberships
    return {
      membership_id: row.membership_id,
      team_id: row.team_id,
      user_id: membership?.user_id as string,
    }
  }).filter(row => row.user_id)

  const userIds = Array.from(new Set(normalized.map(row => row.user_id)))

  const { data: profiles } = userIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
    : { data: [] }

  const profileById: Record<string, { full_name: string | null; email: string | null }> = {}
  for (const p of profiles ?? []) {
    profileById[p.id] = { full_name: p.full_name, email: p.email }
  }

  return {
    ok: true,
    assignments: normalized.map(row => ({
      team_id: row.team_id,
      membership_id: row.membership_id,
      user_id: row.user_id,
      full_name: profileById[row.user_id]?.full_name ?? null,
      email: profileById[row.user_id]?.email ?? null,
    })),
  }
}