'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ─────────────────────────────────────────────────────────────────

export type PendingMembership = {
  id: string
  user_id: string
  organization_id: string
  full_name: string | null
  email: string | null
  created_at: string
}

export type OrgTeam = {
  id: string
  name: string
}

export type SimpleResult = { ok: true } | { ok: false; error: string }

// ─── Auth guard ────────────────────────────────────────────────────────────

async function requireOrgAdmin(): Promise<
  | { ok: true; user: { id: string }; membership: { id: string; organization_id: string } }
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
    user: { id: user.id },
    membership: { id: memberships[0].id, organization_id: memberships[0].organization_id },
  }
}

// ─── getPendingMemberships ─────────────────────────────────────────────────

export async function getPendingMemberships(): Promise<
  { ok: true; pending: PendingMembership[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: memberships, error: memError } = await supabase
    .from('memberships')
    .select('id, user_id, organization_id, created_at')
    .eq('organization_id', guard.membership.organization_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (memError) return { ok: false, error: memError.message }
  if (!memberships || memberships.length === 0) return { ok: true, pending: [] }

  const userIds = Array.from(new Set(memberships.map(m => m.user_id)))
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const profileById: Record<string, { full_name: string | null; email: string | null }> = {}
  for (const p of profiles ?? []) {
    profileById[p.id] = { full_name: p.full_name, email: p.email }
  }

  const pending: PendingMembership[] = memberships.map(m => ({
    id: m.id,
    user_id: m.user_id,
    organization_id: m.organization_id,
    full_name: profileById[m.user_id]?.full_name ?? null,
    email: profileById[m.user_id]?.email ?? null,
    created_at: m.created_at,
  }))

  return { ok: true, pending }
}

// ─── getOrgTeams ───────────────────────────────────────────────────────────

export async function getOrgTeams(): Promise<
  { ok: true; teams: OrgTeam[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .eq('organization_id', guard.membership.organization_id)
    .order('name', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, teams: (data ?? []) as OrgTeam[] }
}

// ─── approveMembership ─────────────────────────────────────────────────────

export async function approveMembership(
  membershipId: string,
  teamIds: string[],
  defaultTeamId: string
): Promise<SimpleResult> {
  if (!membershipId) return { ok: false, error: 'Missing membershipId' }
  if (teamIds.length === 0) return { ok: false, error: 'Pick at least one team' }
  if (!defaultTeamId) return { ok: false, error: 'Pick a default team' }
  if (!teamIds.includes(defaultTeamId)) {
    return { ok: false, error: 'Default team must be one of the selected teams' }
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: target, error: targetError } = await supabase
    .from('memberships')
    .select('id, organization_id, status, role')
    .eq('id', membershipId)
    .maybeSingle()

  if (targetError) return { ok: false, error: targetError.message }
  if (!target) return { ok: false, error: 'Membership not found' }
  if (target.organization_id !== guard.membership.organization_id) {
    return { ok: false, error: 'Cannot approve memberships outside your org' }
  }
  if (target.status !== 'pending') {
    return { ok: false, error: `Membership is already ${target.status}` }
  }

  const { data: teamCheck, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .in('id', teamIds)
    .eq('organization_id', guard.membership.organization_id)

  if (teamError) return { ok: false, error: teamError.message }
  if (!teamCheck || teamCheck.length !== teamIds.length) {
    return { ok: false, error: 'One or more teams do not belong to your org' }
  }

  const { error: updateError } = await supabase
    .from('memberships')
    .update({
      status: 'approved',
      approved_by: guard.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', membershipId)

  if (updateError) return { ok: false, error: `Approve failed: ${updateError.message}` }

  const parentTeamRows = teamIds.map(tid => ({
    membership_id: membershipId,
    team_id: tid,
    is_default: tid === defaultTeamId,
  }))

  const { error: ptError } = await supabase
    .from('parent_teams')
    .insert(parentTeamRows)

  if (ptError) {
    console.error('Failed to create parent_teams after approve:', ptError)
    return {
      ok: false,
      error: `Membership approved but team assignment failed: ${ptError.message}`,
    }
  }

  revalidatePath('/admin')
  return { ok: true }
}