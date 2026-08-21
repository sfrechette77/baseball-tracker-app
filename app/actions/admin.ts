'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ORG_TEAM_IDS } from '@/lib/orgTeams'
import {
  sendParentAccessApprovedEmail,
  sendTeamStaffAssignedEmail,
} from '@/lib/email/access'

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

export type OrganizationLink = {
  id: string
  organization_id: string
  label: string
  url: string
  description: string | null
  is_active: boolean
  is_public: boolean
  sort_order: number
}

export type OrganizationField = {
  id: string
  organization_id: string
  name: string
  address_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  parking_notes: string | null
  restroom_notes: string | null
  seating_notes: string | null
}

export type SimpleResult = { ok: true } | { ok: false; error: string }

export type SaveOrganizationFieldResult =
  | { ok: true; field: { id: string; name: string } }
  | { ok: false; error: string }

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
    .eq('role', 'parent')
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
    .select('id, user_id, organization_id, status, role')
    .eq('id', membershipId)
    .maybeSingle()

  if (targetError) return { ok: false, error: targetError.message }
  if (!target) return { ok: false, error: 'Membership not found' }
  if (target.organization_id !== guard.membership.organization_id) {
    return { ok: false, error: 'Cannot approve memberships outside your org' }
  }

  if (target.role !== 'parent') {
    return {
      ok: false,
      error: 'Only pending parent requests can be approved here',
    }
  }
  if (target.status !== 'pending') {
    return { ok: false, error: `Membership is already ${target.status}` }
  }

  const { data: teamCheck, error: teamError } = await supabase
    .from('teams')
    .select('id, name')
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

  try {
    const [
      { data: profile, error: profileError },
      { data: organization, error: organizationError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', target.user_id)
        .maybeSingle(),

      supabase
        .from('organizations')
        .select('name, slug, primary_color, logo_url')
        .eq('id', guard.membership.organization_id)
        .maybeSingle(),
    ])

    if (profileError) {
      console.error(
        'Parent approval email profile lookup failed:',
        profileError
      )
    } else if (organizationError) {
      console.error(
        'Parent approval email organization lookup failed:',
        organizationError
      )
    } else if (!profile?.email) {
      console.warn(
        'Parent approval email skipped because the profile has no email:',
        membershipId
      )
    } else if (!organization) {
      console.warn(
        'Parent approval email skipped because the organization was not found:',
        guard.membership.organization_id
      )
    } else {
      const emailResult =
        await sendParentAccessApprovedEmail({
          membershipId,
          to: profile.email,
          recipientName: profile.full_name,
          organization: {
            name: organization.name,
            slug: organization.slug,
            primaryColor: organization.primary_color,
            logoUrl: organization.logo_url,
          },
          teamNames: teamCheck
            .map(team => team.name)
            .sort((a, b) => a.localeCompare(b)),
        })

      if (!emailResult.ok) {
        console.error(
          'Parent approval email failed:',
          emailResult.error
        )
      }
    }
  } catch (error) {
    console.error(
      'Unexpected parent approval email failure:',
      error
    )
  }

  revalidatePath('/admin')
  return { ok: true }
}

// ─── rejectMembership ──────────────────────────────────────────────────────

export async function rejectMembership(
  membershipId: string
): Promise<SimpleResult> {
  if (!membershipId) {
    return { ok: false, error: 'Missing membershipId' }
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()

  if (!guard.ok) {
    return { ok: false, error: guard.error }
  }

  const { data: target, error: targetError } = await supabase
    .from('memberships')
    .select('id, organization_id, status, role')
    .eq('id', membershipId)
    .maybeSingle()

  if (targetError) {
    return { ok: false, error: targetError.message }
  }

  if (!target) {
    return { ok: false, error: 'Membership not found' }
  }

  if (
    target.organization_id !==
    guard.membership.organization_id
  ) {
    return {
      ok: false,
      error: 'Cannot reject memberships outside your org',
    }
  }

  if (target.role !== 'parent') {
    return {
      ok: false,
      error: 'Only pending parent requests can be rejected here',
    }
  }

  if (target.status !== 'pending') {
    return {
      ok: false,
      error: `Membership is already ${target.status}`,
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('memberships')
    .update({
      status: 'rejected',
      approved_by: null,
      approved_at: null,
    })
    .eq('id', membershipId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (updateError) {
    return {
      ok: false,
      error: `Reject failed: ${updateError.message}`,
    }
  }

  if (!updated) {
    return {
      ok: false,
      error: 'This membership is no longer pending',
    }
  }

  revalidatePath('/admin')
  return { ok: true }
}

// ─── Types (Members) ───────────────────────────────────────────────────────

export type GuardianAthleteAssignment = {
  id: string
  display_name: string
  status: string
  relationship: string | null
  is_primary: boolean
}

export type OrganizationAthleteOption = {
  id: string
  display_name: string
  status: string
}

export type ApprovedParent = {
  id: string
  user_id: string
  role: 'parent' | 'team_admin'
  full_name: string | null
  email: string | null
  teams: {
    id: string
    name: string
    is_default: boolean
  }[]
  team_admin_teams: {
    id: string
    name: string
    staff_title: string | null
  }[]
  athletes: GuardianAthleteAssignment[]
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
  .select('id, user_id, organization_id, role, created_at')
  .eq('organization_id', guard.membership.organization_id)
  .in('role', ['parent', 'team_admin'])
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

const parentMembershipIds = memberships
  .filter(membership => membership.role === 'parent')
  .map(membership => membership.id)

const {
  data: guardianAthleteRows,
  error: guardianAthletesError,
} = parentMembershipIds.length > 0
  ? await supabase
      .from('guardian_athletes')
      .select(`
        membership_id,
        athlete_id,
        relationship,
        is_primary,
        athletes!inner (
          id,
          display_name,
          status
        )
      `)
      .in('membership_id', parentMembershipIds)
  : {
      data: [],
      error: null,
    }

if (guardianAthletesError) {
  return {
    ok: false,
    error: guardianAthletesError.message,
  }
}

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
        .select('membership_id, team_id, staff_title, teams(id, name)')
        .in('membership_id', teamAdminMembershipIds)
    : { data: [] }

  const teamAdminMembershipById: Record<string, { user_id: string }> = {}
  for (const m of teamAdminMemberships ?? []) {
    teamAdminMembershipById[m.id] = { user_id: m.user_id }
  }

  const teamAdminTeamsByUserId: Record<
    string,
    {
      id: string
      name: string
      staff_title: string | null
    }[]
  > = {}
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
        staff_title: row.staff_title ?? null,
      })
    }
  }

  const athletesByMembership: Record<
    string,
    GuardianAthleteAssignment[]
  > = {}

  for (const row of guardianAthleteRows ?? []) {
    const athlete = row.athletes as unknown as {
      id: string
      display_name: string
      status: string
    }

    if (!athlete || athlete.status === 'archived') continue

    if (!athletesByMembership[row.membership_id]) {
      athletesByMembership[row.membership_id] = []
    }

    athletesByMembership[row.membership_id].push({
      id: athlete.id,
      display_name: athlete.display_name,
      status: athlete.status,
      relationship: row.relationship,
      is_primary: row.is_primary,
    })
  }

  for (const assignments of Object.values(athletesByMembership)) {
    assignments.sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    )
  }

  const members: ApprovedParent[] = memberships.map(m => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role as 'parent' | 'team_admin',
    full_name: profileById[m.user_id]?.full_name ?? null,
    email: profileById[m.user_id]?.email ?? null,
    teams: teamsByMembership[m.id] ?? [],
    team_admin_teams: teamAdminTeamsByUserId[m.user_id] ?? [],
    athletes: athletesByMembership[m.id] ?? [],
    created_at: m.created_at,
  }))

  return { ok: true, members }
}

export async function getOrganizationAthletes(): Promise<
  | {
      ok: true
      athletes: OrganizationAthleteOption[]
    }
  | {
      ok: false
      error: string
    }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()

  if (!guard.ok) {
    return { ok: false, error: guard.error }
  }

  const { data, error } = await supabase
    .from('athletes')
    .select('id, display_name, status')
    .eq('organization_id', guard.membership.organization_id)
    .neq('status', 'archived')
    .order('display_name', { ascending: true })

  if (error) {
    return { ok: false, error: error.message }
  }

  return {
    ok: true,
    athletes: (data ?? []) as OrganizationAthleteOption[],
  }
}

export async function updateGuardianAthleteAssignments(input: {
  membershipId: string
  assignments: {
    athleteId: string
    relationship?: string | null
  }[]
  primaryAthleteId?: string | null
}): Promise<
  | {
      ok: true
      assignedCount: number
    }
  | {
      ok: false
      error: string
    }
> {
  const membershipId = input.membershipId.trim()

  const assignments = input.assignments
    .map(assignment => ({
      athleteId: assignment.athleteId.trim(),
      relationship: assignment.relationship?.trim() || null,
    }))
    .filter(assignment => Boolean(assignment.athleteId))

  const athleteIds = assignments.map(
    assignment => assignment.athleteId
  )

  if (new Set(athleteIds).size !== athleteIds.length) {
    return {
      ok: false,
      error: 'Athlete assignments must not contain duplicates',
    }
  }

  const primaryAthleteId =
    input.primaryAthleteId?.trim() || null

  if (!membershipId) {
    return {
      ok: false,
      error: 'Missing parent membership',
    }
  }

  if (
    primaryAthleteId &&
    !athleteIds.includes(primaryAthleteId)
  ) {
    return {
      ok: false,
      error: 'Primary athlete must be selected',
    }
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()

  if (!guard.ok) {
    return { ok: false, error: guard.error }
  }

  const { data, error } = await supabase.rpc(
    'replace_guardian_athletes',
    {
      p_membership_id: membershipId,
      p_athlete_ids: athleteIds,
      p_primary_athlete_id: primaryAthleteId,
    }
  )

  if (error) {
    return {
      ok: false,
      error: error.message,
    }
  }

  for (const assignment of assignments) {
    const {
      data: updatedRelationship,
      error: relationshipError,
    } = await supabase
      .from('guardian_athletes')
      .update({
        relationship: assignment.relationship,
      })
      .eq('membership_id', membershipId)
      .eq('athlete_id', assignment.athleteId)
      .select('id')
      .maybeSingle()

    if (relationshipError) {
      return {
        ok: false,
        error: relationshipError.message,
      }
    }

    if (!updatedRelationship) {
      return {
        ok: false,
        error: 'Athlete relationship row was not found',
      }
    }
  }

  const result = Array.isArray(data) ? data[0] : data

  if (
    !result?.result_membership_id ||
    typeof result.result_assigned_count !== 'number'
  ) {
    return {
      ok: false,
      error: 'Updated athlete assignments were not returned',
    }
  }

  revalidatePath('/admin')

  return {
    ok: true,
    assignedCount: result.result_assigned_count,
  }
}

export async function makeMemberTeamAdmin(
  parentMembershipId: string,
  teamIds: string[],
  staffTitleInput?: string | null
): Promise<SimpleResult> {
  if (!parentMembershipId) return { ok: false, error: 'Missing parentMembershipId' }

  const uniqueTeamIds = Array.from(new Set(teamIds))

  if (uniqueTeamIds.length === 0) {
    return { ok: false, error: 'Pick at least one team' }
  }

  const staffTitle = staffTitleInput?.trim() || null

  if (staffTitle && staffTitle.length > 80) {
    return {
      ok: false,
      error: 'Staff title must be 80 characters or fewer',
    }
  }

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
    .select('id, name')
    .in('id', uniqueTeamIds)
    .eq('organization_id', guard.membership.organization_id)

  if (teamError) return { ok: false, error: teamError.message }
  if (!teamCheck || teamCheck.length !== uniqueTeamIds.length) {
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

  const {
    data: existingAssignments,
    error: existingAssignmentsError,
  } = await supabase
    .from('team_admins')
    .select('team_id')
    .eq('membership_id', teamAdminMembershipId)
    .in('team_id', uniqueTeamIds)

  if (existingAssignmentsError) {
    return {
      ok: false,
      error: existingAssignmentsError.message,
    }
  }

  const existingTeamIds = new Set(
    (existingAssignments ?? []).map(row => row.team_id)
  )

  const newlyAssignedTeamIds = uniqueTeamIds.filter(
    teamId => !existingTeamIds.has(teamId)
  )

  const rows = uniqueTeamIds.map(teamId => ({
    membership_id: teamAdminMembershipId,
    team_id: teamId,
    staff_title: staffTitle,
  }))

  const { error: assignError } = await supabase
    .from('team_admins')
    .upsert(rows, { onConflict: 'membership_id,team_id' })

  if (assignError) return { ok: false, error: assignError.message }

  if (newlyAssignedTeamIds.length > 0) {
    try {
      const [
        { data: profile, error: profileError },
        { data: organization, error: organizationError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', parentMembership.user_id)
          .maybeSingle(),

        supabase
          .from('organizations')
          .select('name, slug, primary_color, logo_url')
          .eq('id', guard.membership.organization_id)
          .maybeSingle(),
      ])

      if (profileError) {
        console.error(
          'Team staff email profile lookup failed:',
          profileError
        )
      } else if (organizationError) {
        console.error(
          'Team staff email organization lookup failed:',
          organizationError
        )
      } else if (!profile?.email) {
        console.warn(
          'Team staff email skipped because the profile has no email:',
          parentMembership.user_id
        )
      } else if (!organization) {
        console.warn(
          'Team staff email skipped because the organization was not found:',
          guard.membership.organization_id
        )
      } else {
        const newTeamIdSet = new Set(newlyAssignedTeamIds)

        const emailResult = await sendTeamStaffAssignedEmail({
          teamAdminMembershipId,
          newlyAssignedTeamIds,
          to: profile.email,
          recipientName: profile.full_name,
          organization: {
            name: organization.name,
            slug: organization.slug,
            primaryColor: organization.primary_color,
            logoUrl: organization.logo_url,
          },
          teamNames: teamCheck
            .filter(team => newTeamIdSet.has(team.id))
            .map(team => team.name)
            .sort((a, b) => a.localeCompare(b)),
          staffTitle,
        })

        if (!emailResult.ok) {
          console.error(
            'Team staff assignment email failed:',
            emailResult.error
          )
        }
      }
    } catch (error) {
      console.error(
        'Unexpected team staff assignment email failure:',
        error
      )
    }
  }

  revalidatePath('/admin')
  return { ok: true }
}


export async function grantTeamAdminByEmail(
  email: string,
  teamIds: string[],
  staffTitleInput?: string | null
): Promise<SimpleResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return { ok: false, error: 'Enter an email address' }
  if (teamIds.length === 0) return { ok: false, error: 'Pick at least one team' }

  const staffTitle = staffTitleInput?.trim() || null

  if (staffTitle && staffTitle.length > 80) {
    return {
      ok: false,
      error: 'Staff title must be 80 characters or fewer',
    }
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (profileError) return { ok: false, error: profileError.message }
  if (!profile) return { ok: false, error: 'That user needs to sign up first.' }

  const uniqueTeamIds = Array.from(new Set(teamIds))
  const { data: teamCheck, error: teamError } = await supabase
    .from('teams')
    .select('id, name')
    .in('id', uniqueTeamIds)
    .eq('organization_id', guard.membership.organization_id)

  if (teamError) return { ok: false, error: teamError.message }
  if (!teamCheck || teamCheck.length !== uniqueTeamIds.length) {
    return { ok: false, error: 'One or more teams do not belong to your org' }
  }

  const { data: existingMembership, error: existingError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', profile.id)
    .eq('organization_id', guard.membership.organization_id)
    .eq('role', 'team_admin')
    .maybeSingle()

  if (existingError) return { ok: false, error: existingError.message }

  let membershipId = existingMembership?.id

  if (!membershipId) {
    const { data: inserted, error: insertError } = await supabase
      .from('memberships')
      .insert({
        user_id: profile.id,
        organization_id: guard.membership.organization_id,
        role: 'team_admin',
        status: 'approved',
        approved_by: guard.user.id,
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) return { ok: false, error: insertError.message }
    membershipId = inserted.id
  }

  const {
    data: existingAssignments,
    error: existingAssignmentsError,
  } = await supabase
    .from('team_admins')
    .select('team_id')
    .eq('membership_id', membershipId)
    .in('team_id', uniqueTeamIds)

  if (existingAssignmentsError) {
    return {
      ok: false,
      error: existingAssignmentsError.message,
    }
  }

  const existingTeamIds = new Set(
    (existingAssignments ?? []).map(row => row.team_id)
  )

  const newlyAssignedTeamIds = uniqueTeamIds.filter(
    teamId => !existingTeamIds.has(teamId)
  )

  const rows = uniqueTeamIds.map(teamId => ({
    membership_id: membershipId,
    team_id: teamId,
    staff_title: staffTitle,
  }))

  const { error: assignError } = await supabase
    .from('team_admins')
    .upsert(rows, { onConflict: 'membership_id,team_id' })

  if (assignError) return { ok: false, error: assignError.message }

  if (newlyAssignedTeamIds.length > 0) {
    try {
      const {
        data: organization,
        error: organizationError,
      } = await supabase
        .from('organizations')
        .select('name, slug, primary_color, logo_url')
        .eq('id', guard.membership.organization_id)
        .maybeSingle()

      if (organizationError) {
        console.error(
          'Team staff email organization lookup failed:',
          organizationError
        )
      } else if (!organization) {
        console.warn(
          'Team staff email skipped because the organization was not found:',
          guard.membership.organization_id
        )
      } else {
        const newTeamIdSet = new Set(newlyAssignedTeamIds)

        const emailResult = await sendTeamStaffAssignedEmail({
          teamAdminMembershipId: membershipId,
          newlyAssignedTeamIds,
          to: profile.email || normalizedEmail,
          recipientName: profile.full_name,
          organization: {
            name: organization.name,
            slug: organization.slug,
            primaryColor: organization.primary_color,
            logoUrl: organization.logo_url,
          },
          teamNames: teamCheck
            .filter(team => newTeamIdSet.has(team.id))
            .map(team => team.name)
            .sort((a, b) => a.localeCompare(b)),
          staffTitle,
        })

        if (!emailResult.ok) {
          console.error(
            'Team staff assignment email failed:',
            emailResult.error
          )
        }
      }
    } catch (error) {
      console.error(
        'Unexpected team staff assignment email failure:',
        error
      )
    }
  }

  revalidatePath('/admin')
  return { ok: true }
}

export async function updateMemberTeamAdminTitle(
  parentMembershipId: string,
  teamId: string,
  staffTitleInput?: string | null
): Promise<SimpleResult> {
  if (!parentMembershipId) {
    return { ok: false, error: 'Missing parentMembershipId' }
  }

  if (!teamId) {
    return { ok: false, error: 'Missing teamId' }
  }

  const staffTitle = staffTitleInput?.trim() || null

  if (staffTitle && staffTitle.length > 80) {
    return {
      ok: false,
      error: 'Staff title must be 80 characters or fewer',
    }
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: sourceMembership, error: sourceError } = await supabase
    .from('memberships')
    .select('id, user_id, organization_id')
    .eq('id', parentMembershipId)
    .maybeSingle()

  if (sourceError) return { ok: false, error: sourceError.message }
  if (!sourceMembership) {
    return { ok: false, error: 'Membership not found' }
  }

  if (sourceMembership.organization_id !== guard.membership.organization_id) {
    return { ok: false, error: 'Cannot manage memberships outside your org' }
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('organization_id', guard.membership.organization_id)
    .maybeSingle()

  if (teamError) return { ok: false, error: teamError.message }
  if (!team) {
    return { ok: false, error: 'Team not found in your organization' }
  }

  const { data: teamAdminMembership, error: adminError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', sourceMembership.user_id)
    .eq('organization_id', guard.membership.organization_id)
    .eq('role', 'team_admin')
    .maybeSingle()

  if (adminError) return { ok: false, error: adminError.message }
  if (!teamAdminMembership) {
    return { ok: false, error: 'Team admin membership not found' }
  }

  const { data: updatedAssignment, error: updateError } = await supabase
    .from('team_admins')
    .update({ staff_title: staffTitle })
    .eq('membership_id', teamAdminMembership.id)
    .eq('team_id', teamId)
    .select('id')
    .maybeSingle()

  if (updateError) return { ok: false, error: updateError.message }
  if (!updatedAssignment) {
    return { ok: false, error: 'Team admin assignment not found' }
  }

  revalidatePath('/admin')
  return { ok: true }
}

export async function removeMemberTeamAdmin(
  parentMembershipId: string,
  teamId: string
): Promise<SimpleResult> {
  if (!parentMembershipId) return { ok: false, error: 'Missing parentMembershipId' }
  if (!teamId) return { ok: false, error: 'Missing teamId' }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: parentMembership, error: parentError } = await supabase
    .from('memberships')
    .select('id, user_id, organization_id, role')
    .eq('id', parentMembershipId)
    .maybeSingle()

  if (parentError) return { ok: false, error: parentError.message }
  if (!parentMembership) return { ok: false, error: 'Parent membership not found' }
  if (parentMembership.organization_id !== guard.membership.organization_id) {
    return { ok: false, error: 'Cannot manage memberships outside your org' }
  }

  const { data: teamAdminMembership, error: adminError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', parentMembership.user_id)
    .eq('organization_id', guard.membership.organization_id)
    .eq('role', 'team_admin')
    .maybeSingle()

  if (adminError) return { ok: false, error: adminError.message }
  if (!teamAdminMembership) return { ok: false, error: 'Team admin membership not found' }

  const { error: deleteError } = await supabase
    .from('team_admins')
    .delete()
    .eq('membership_id', teamAdminMembership.id)
    .eq('team_id', teamId)

  if (deleteError) return { ok: false, error: deleteError.message }

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

export async function getOrganizationLinks(): Promise<
  { ok: true; links: OrganizationLink[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data, error } = await supabase
    .from('organization_links')
    .select('id, organization_id, label, url, description, is_active, is_public, sort_order')
    .eq('organization_id', guard.membership.organization_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return { ok: false, error: error.message }

  return { ok: true, links: data ?? [] }
}

export type OrganizationLaunchReadiness = {
  logoConfigured: boolean
  brandColorConfigured: boolean
  currentSeasonExists: boolean
  teamExists: boolean
  rosterStarted: boolean
  teamAdminAssigned: boolean
  orgAdminExists: boolean
  signupLinkAvailable: boolean
  publicDescriptionConfigured: boolean
  publicLinkExists: boolean
}

export async function getOrganizationLaunchReadiness(): Promise<
  | { ok: true; readiness: OrganizationLaunchReadiness }
  | { ok: false; error: string }
> {
  const ctx = await requireOrgAdmin()

  if (!ctx.ok) {
    return { ok: false, error: ctx.error }
  }

  const supabase = await createClient()
  const organizationId = ctx.membership.organization_id

  const [
    organizationResult,
    seasonResult,
    teamResult,
    adminResult,
    teamAdminResult,
    publicLinkResult,
  ] = await Promise.all([

    supabase
      .from('organizations')
      .select('slug, logo_url, primary_color, public_description')
      .eq('id', organizationId)
      .single(),

    supabase
      .from('seasons')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_current', true)
      .limit(1),

    supabase
      .from('teams')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_opponent', false)
      .limit(1),

    supabase
      .from('memberships')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('role', 'org_admin')
      .eq('status', 'approved')
      .limit(1),

    supabase
  .from('team_admins')
  .select(`
    membership_id,
    memberships!inner (
      organization_id,
      role,
      status
    )
  `)
  .eq('memberships.organization_id', organizationId)
  .eq('memberships.role', 'team_admin')
  .eq('memberships.status', 'approved')
  .limit(1),  

    supabase
      .from('organization_links')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .eq('is_public', true)
      .limit(1),
  ])

  const firstError =
    organizationResult.error ||
    seasonResult.error ||
    teamResult.error ||
    adminResult.error ||
    teamAdminResult.error ||
    publicLinkResult.error

  if (firstError) {
    return {
      ok: false,
      error: firstError.message,
    }
  }

  const organization = organizationResult.data

  let rosterStarted = false

  const currentSeasonId = seasonResult.data?.[0]?.id

  if (currentSeasonId) {
    const { data: teamSeasons, error: teamSeasonsError } =
      await supabase
        .from('team_seasons')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('season_id', currentSeasonId)

    if (teamSeasonsError) {
      return {
        ok: false,
        error: teamSeasonsError.message,
      }
    }

    const teamSeasonIds = (teamSeasons ?? []).map(
      teamSeason => teamSeason.id
    )

    if (teamSeasonIds.length > 0) {
      const { count, error: playersError } = await supabase
        .from('players')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .in('team_season_id', teamSeasonIds)
        .eq('roster_status', 'active')

      if (playersError) {
        return {
          ok: false,
          error: playersError.message,
        }
      }

      rosterStarted = (count ?? 0) > 0
    }
  }

  return {
    ok: true,
    readiness: {
      logoConfigured: Boolean(organization.logo_url?.trim()),
      brandColorConfigured: Boolean(organization.primary_color?.trim()),
      currentSeasonExists: Boolean(seasonResult.data?.length),
      teamExists: Boolean(teamResult.data?.length),
      rosterStarted,
      teamAdminAssigned: Boolean(teamAdminResult.data?.length), 
      orgAdminExists: Boolean(adminResult.data?.length),
      signupLinkAvailable: Boolean(organization.slug?.trim()),
      publicDescriptionConfigured: Boolean(
        organization.public_description?.trim()
      ),
      publicLinkExists: Boolean(publicLinkResult.data?.length),
    },
  }
}

export async function saveOrganizationLink(input: {
  id?: string
  label: string
  url: string
  description?: string | null
  isActive: boolean
  isPublic: boolean
  sortOrder: number
}): Promise<SimpleResult> {
  const label = input.label.trim()
  const url = input.url.trim()
  const description = input.description?.trim() || null

  if (!label) return { ok: false, error: 'Enter a link label' }
  if (!url) return { ok: false, error: 'Enter a link URL' }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { ok: false, error: 'Enter a valid URL, including https://' }
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { ok: false, error: 'Link URL must start with http:// or https://' }
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  if (input.id) {
    const { error } = await supabase
      .from('organization_links')
      .update({
        label,
        url,
        description,
        is_active: input.isActive,
        is_public: input.isPublic,
        sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('organization_id', guard.membership.organization_id)

    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('organization_links')
      .insert({
        organization_id: guard.membership.organization_id,
        label,
        url,
        description,
        is_active: input.isActive,
        is_public: input.isPublic,
        sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
      })

    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/admin')

  return { ok: true }
}

export async function deleteOrganizationLink(id: string): Promise<SimpleResult> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { error } = await supabase
    .from('organization_links')
    .delete()
    .eq('id', id)
    .eq('organization_id', guard.membership.organization_id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/admin')

  return { ok: true }
}

// ─── Organization fields ───────────────────────────────────────────────────

export async function getOrganizationFields(): Promise<
  { ok: true; fields: OrganizationField[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data, error } = await supabase
    .from('fields')
    .select(
      'id, organization_id, name, address_line, city, state, postal_code, latitude, longitude, parking_notes, restroom_notes, seating_notes'
    )
    .eq('organization_id', guard.membership.organization_id)
    .order('name', { ascending: true })

  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    fields: (data ?? []) as OrganizationField[],
  }
}

export async function saveOrganizationField(input: {
  id?: string
  name: string
  addressLine?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  latitude?: string | number | null
  longitude?: string | number | null
  parkingNotes?: string | null
  restroomNotes?: string | null
  seatingNotes?: string | null
}): Promise<SaveOrganizationFieldResult> {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Enter a field name' }

  const parseCoordinate = (
    value: string | number | null | undefined
  ): number | null => {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'string' && !value.trim()) return null

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  const latitude = parseCoordinate(input.latitude)
  const longitude = parseCoordinate(input.longitude)

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { ok: false, error: 'Latitude and longitude must be valid numbers' }
  }

  if ((latitude === null) !== (longitude === null)) {
    return {
      ok: false,
      error: 'Enter both latitude and longitude, or leave both blank',
    }
  }

  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return { ok: false, error: 'Latitude must be between -90 and 90' }
  }

  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return { ok: false, error: 'Longitude must be between -180 and 180' }
  }

  const values = {
    name,
    address_line: input.addressLine?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    postal_code: input.postalCode?.trim() || null,
    latitude,
    longitude,
    parking_notes: input.parkingNotes?.trim() || null,
    restroom_notes: input.restroomNotes?.trim() || null,
    seating_notes: input.seatingNotes?.trim() || null,
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  let savedField: { id: string; name: string } | null = null

  if (input.id) {
    const { data, error } = await supabase
      .from('fields')
      .update(values)
      .eq('id', input.id)
      .eq('organization_id', guard.membership.organization_id)
      .select('id, name')
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Field not found' }

    savedField = data
  } else {
    const { data, error } = await supabase
      .from('fields')
      .insert({
        organization_id: guard.membership.organization_id,
        ...values,
      })
      .select('id, name')
      .single()

    if (error) return { ok: false, error: error.message }

    savedField = data
  }

  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/schedule')

  return { ok: true, field: savedField }
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

// ─── Season Team Setup ────────────────────────────────────────────────────

export type SeasonTeamSetupRow = {
  teamSeasonId: string | null
  teamId: string
  permanentName: string
  displayName: string
  division: string
  ageGroup: string
}

export type CurrentSeasonTeamSetupResult =
  | {
      ok: true
      seasonId: string
      seasonName: string
      teams: SeasonTeamSetupRow[]
    }
  | {
      ok: false
      error: string
    }

export async function getCurrentSeasonTeamSetup():
  Promise<CurrentSeasonTeamSetupResult> {
  const supabase = await createClient()
  const guard = await requireOrgAdmin()

  if (!guard.ok) {
    return { ok: false, error: guard.error }
  }

  const organizationId = guard.membership.organization_id

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('is_current', true)
    .limit(1)
    .maybeSingle()

  if (seasonError) {
    return { ok: false, error: seasonError.message }
  }

  if (!season) {
    return { ok: false, error: 'No active season found' }
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, division')
    .eq('organization_id', organizationId)
    .eq('is_opponent', false)
    .order('name')

  if (teamsError) {
    return { ok: false, error: teamsError.message }
  }

  if (!teams || teams.length === 0) {
    return {
      ok: true,
      seasonId: season.id,
      seasonName: season.name,
      teams: [],
    }
  }

  const teamIds = teams.map(team => team.id)

  const { data: teamSeasons, error: teamSeasonsError } = await supabase
    .from('team_seasons')
    .select('id, team_id, display_name, division, age_group')
    .eq('organization_id', organizationId)
    .eq('season_id', season.id)
    .in('team_id', teamIds)

  if (teamSeasonsError) {
    return { ok: false, error: teamSeasonsError.message }
  }

  const teamSeasonByTeamId = new Map(
    (teamSeasons ?? []).map(teamSeason => [teamSeason.team_id, teamSeason])
  )

  return {
    ok: true,
    seasonId: season.id,
    seasonName: season.name,
    teams: teams.map(team => {
      const teamSeason = teamSeasonByTeamId.get(team.id)

      return {
        teamSeasonId: teamSeason?.id ?? null,
        teamId: team.id,
        permanentName: team.name,
        displayName: teamSeason?.display_name ?? team.name,
        division: teamSeason?.division ?? team.division ?? '',
        ageGroup: teamSeason?.age_group ?? '',
      }
    }),
  }
}

export async function updateSeasonTeamSetup(input: {
  teamSeasonId: string
  displayName: string
  division: string
  ageGroup: string
}): Promise<SimpleResult> {
  const displayName = input.displayName.trim()
  const division = input.division.trim()
  const ageGroup = input.ageGroup.trim()

  if (!input.teamSeasonId) {
    return { ok: false, error: 'Team-season record is required' }
  }

  if (!displayName) {
    return { ok: false, error: 'Team display name is required' }
  }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()

  if (!guard.ok) {
    return { ok: false, error: guard.error }
  }

  const organizationId = guard.membership.organization_id

  const { data: target, error: targetError } = await supabase
    .from('team_seasons')
    .select(`
      id,
      organization_id,
      season_id,
      seasons:season_id!inner ( is_current ),
      teams:team_id!inner ( is_opponent )
    `)
    .eq('id', input.teamSeasonId)
    .eq('organization_id', organizationId)
    .eq('seasons.is_current', true)
    .eq('teams.is_opponent', false)
    .maybeSingle()

  if (targetError) {
    return { ok: false, error: targetError.message }
  }

  if (!target) {
    return {
      ok: false,
      error: 'Current-season team record not found',
    }
  }

  const { error: updateError } = await supabase
    .from('team_seasons')
    .update({
      display_name: displayName,
      division: division || null,
      age_group: ageGroup || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.teamSeasonId)
    .eq('organization_id', organizationId)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/team')
  revalidatePath('/schedule')
  revalidatePath('/stats')
  revalidatePath('/standings')

  return { ok: true }
}

// ─── startNewSeason ────────────────────────────────────────────────────────

export async function startNewSeason(
  name: string,
  startDate: string,
  endDate: string,
  copyRosters: boolean
): Promise<SimpleResult> {
  const seasonName = name.trim()

  if (!seasonName) return { ok: false, error: 'Enter a season name' }
  if (!startDate) return { ok: false, error: 'Enter a start date' }
  if (!endDate) return { ok: false, error: 'Enter an end date' }
  if (endDate < startDate) return { ok: false, error: 'End date must be after start date' }

  const supabase = await createClient()
  const guard = await requireOrgAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const { error } = await supabase.rpc('start_new_season', {
    p_organization_id: guard.membership.organization_id,
    p_name: seasonName,
    p_start_date: startDate,
    p_end_date: endDate,
    p_copy_rosters: copyRosters,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/team')
  revalidatePath('/schedule')
  revalidatePath('/stats')
  revalidatePath('/roster')

  return { ok: true }
}