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

const ORG_TEAM_IDS = [
  '4beb0750-1883-4b56-a386-db280675036c',
  '0c8cc8d0-2398-41c2-8ba0-036d62ee13a6',
]

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

  const teams = ((data ?? []) as OrgTeam[]).filter(team =>
  ORG_TEAM_IDS.includes(team.id)
)

  return { ok: true, teams}
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

// ─── Types (Members) ───────────────────────────────────────────────────────

export type ApprovedParent = {
  id: string           // membership id
  user_id: string
  full_name: string | null
  email: string | null
  teams: { id: string; name: string; is_default: boolean }[]
  team_admin_teams: { id: string; name: string }[]
  created_at: string
}

// ─── getApprovedParents ────────────────────────────────────────────────────

export async function getApprovedParents(): Promise<
  { ok: true; members: ApprovedParent[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: memberships, error: memError } = await supabase
    .from('memberships')
    .select('id, user_id, organization_id, created_at')
    .eq('organization_id', guard.membership.organization_id)
    .eq('role', 'parent')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  if (memError) return { ok: false, error: memError.message }
  if (!memberships || memberships.length === 0) return { ok: true, members: [] }

  const membershipIds = memberships.map(m => m.id)
  const userIds = Array.from(new Set(memberships.map(m => m.user_id)))

  const [{ data: profiles }, { data: parentTeams }, { data: teamAdminMemberships }] = await Promise.all([
  supabase.from('profiles').select('id, full_name, email').in('id', userIds),
  supabase
    .from('parent_teams')
    .select('membership_id, team_id, is_default, teams(id, name)')
    .in('membership_id', membershipIds),
  supabase
    .from('memberships')
    .select('id, user_id')
    .eq('organization_id', guard.membership.organization_id)
    .eq('role', 'team_admin')
    .eq('status', 'approved')
    .in('user_id', userIds),
])

  const profileById: Record<string, { full_name: string | null; email: string | null }> = {}
  for (const p of profiles ?? []) {
    profileById[p.id] = { full_name: p.full_name, email: p.email }
  }

  const teamsByMembership: Record<string, { id: string; name: string; is_default: boolean }[]> = {}
  for (const pt of parentTeams ?? []) {
    if (!teamsByMembership[pt.membership_id]) teamsByMembership[pt.membership_id] = []
    const team = pt.teams as unknown as { id: string; name: string }
    if (team) {
      teamsByMembership[pt.membership_id].push({
        id: team.id,
        name: team.name,
        is_default: pt.is_default,
      })
    }
  }

  const teamAdminMembershipIds = (teamAdminMemberships ?? []).map(m => m.id)

  const { data: teamAdminRows } = teamAdminMembershipIds.length > 0
    ? await supabase
        .from('team_admins')
        .select('membership_id, team_id, teams(id, name)')
        .in('membership_id', teamAdminMembershipIds)
    : { data: [] }

  const teamAdminMembershipById: Record<string, { user_id: string }> = {}
  for (const m of teamAdminMemberships ?? []) {
    teamAdminMembershipById[m.id] = { user_id: m.user_id }
  }

  const teamAdminTeamsByUserId: Record<string, { id: string; name: string }[]> = {}
  for (const row of teamAdminRows ?? []) {
    const membership = teamAdminMembershipById[row.membership_id]
    if (!membership) continue

    if (!teamAdminTeamsByUserId[membership.user_id]) {
      teamAdminTeamsByUserId[membership.user_id] = []
    }

    const team = row.teams as unknown as { id: string; name: string }
    if (team) {
      teamAdminTeamsByUserId[membership.user_id].push({
        id: team.id,
        name: team.name,
      })
    }
  }

  const members: ApprovedParent[] = memberships.map(m => ({
    id: m.id,
    user_id: m.user_id,
    full_name: profileById[m.user_id]?.full_name ?? null,
    email: profileById[m.user_id]?.email ?? null,
    teams: teamsByMembership[m.id] ?? [],
    team_admin_teams: teamAdminTeamsByUserId[m.user_id] ?? [],
    created_at: m.created_at,
  }))

  return { ok: true, members }
}

export async function makeMemberTeamAdmin(
  parentMembershipId: string,
  teamIds: string[]
): Promise<SimpleResult> {
  if (!parentMembershipId) return { ok: false, error: 'Missing parentMembershipId' }
  if (teamIds.length === 0) return { ok: false, error: 'Pick at least one team' }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: parentMembership, error: parentError } = await supabase
    .from('memberships')
    .select('id, user_id, organization_id, role, status')
    .eq('id', parentMembershipId)
    .maybeSingle()

  if (parentError) return { ok: false, error: parentError.message }
  if (!parentMembership) return { ok: false, error: 'Parent membership not found' }
  if (parentMembership.organization_id !== guard.membership.organization_id) {
    return { ok: false, error: 'Cannot manage memberships outside your org' }
  }
  if (parentMembership.role !== 'parent') {
    return { ok: false, error: 'Only parent memberships can be promoted here' }
  }
  if (parentMembership.status !== 'approved') {
    return { ok: false, error: 'Only approved parents can become team admins' }
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

  const { data: existingTeamAdmin, error: existingError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', parentMembership.user_id)
    .eq('organization_id', guard.membership.organization_id)
    .eq('role', 'team_admin')
    .maybeSingle()

  if (existingError) return { ok: false, error: existingError.message }

  let teamAdminMembershipId = existingTeamAdmin?.id

  if (!teamAdminMembershipId) {
    const { data: inserted, error: insertError } = await supabase
      .from('memberships')
      .insert({
        user_id: parentMembership.user_id,
        organization_id: guard.membership.organization_id,
        role: 'team_admin',
        status: 'approved',
        approved_by: guard.user.id,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) return { ok: false, error: insertError.message }
    teamAdminMembershipId = inserted.id
  }

  const rows = teamIds.map(teamId => ({
    membership_id: teamAdminMembershipId,
    team_id: teamId,
  }))

  const { error: assignError } = await supabase
    .from('team_admins')
    .upsert(rows, { onConflict: 'membership_id,team_id' })

  if (assignError) return { ok: false, error: assignError.message }

  revalidatePath('/admin')
  return { ok: true }
}

// ─── updateMemberTeams ─────────────────────────────────────────────────────

export async function updateMemberTeams(
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

  

  // Verify membership belongs to this org and is an approved parent
  const { data: target, error: targetError } = await supabase
    .from('memberships')
    .select('id, organization_id, role, status')
    .eq('id', membershipId)
    .maybeSingle()

  if (targetError) return { ok: false, error: targetError.message }
  if (!target) return { ok: false, error: 'Membership not found' }
  if (target.organization_id !== guard.membership.organization_id) {
    return { ok: false, error: 'Cannot edit memberships outside your org' }
  }
  if (target.role !== 'parent') return { ok: false, error: 'Only parent teams can be edited here' }

  // Verify all teams belong to this org
  const { data: teamCheck, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .in('id', teamIds)
    .eq('organization_id', guard.membership.organization_id)

  if (teamError) return { ok: false, error: teamError.message }
  if (!teamCheck || teamCheck.length !== teamIds.length) {
    return { ok: false, error: 'One or more teams do not belong to your org' }
  }

  // Replace parent_teams rows
  const { error: deleteError } = await supabase
    .from('parent_teams')
    .delete()
    .eq('membership_id', membershipId)

  if (deleteError) return { ok: false, error: `Failed to clear teams: ${deleteError.message}` }

  const rows = teamIds.map(tid => ({
    membership_id: membershipId,
    team_id: tid,
    is_default: tid === defaultTeamId,
  }))

  const { error: insertError } = await supabase.from('parent_teams').insert(rows)
  if (insertError) return { ok: false, error: `Failed to assign teams: ${insertError.message}` }

  revalidatePath('/admin')
  return { ok: true }
}

// ─── removeMembership ──────────────────────────────────────────────────────

export async function removeMembership(membershipId: string): Promise<SimpleResult> {
  if (!membershipId) return { ok: false, error: 'Missing membershipId' }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  // Verify membership belongs to this org
  const { data: target, error: targetError } = await supabase
    .from('memberships')
    .select('id, organization_id, role')
    .eq('id', membershipId)
    .maybeSingle()

  if (targetError) return { ok: false, error: targetError.message }
  if (!target) return { ok: false, error: 'Membership not found' }
  if (target.organization_id !== guard.membership.organization_id) {
    return { ok: false, error: 'Cannot remove memberships outside your org' }
  }
  if (target.role !== 'parent') {
    return { ok: false, error: 'Only parent memberships can be removed here' }
  }

  const { error: deleteError } = await supabase
    .from('memberships')
    .delete()
    .eq('id', membershipId)

  if (deleteError) return { ok: false, error: deleteError.message }

  revalidatePath('/admin')
  return { ok: true }
}