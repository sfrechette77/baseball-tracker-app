'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type AssignableAthlete = {
  id: string
  displayName: string
  status: string
  previousJerseyNumber: string | null
  previousPosition: string | null
}

export type RosterWriteResult =
  | {
      ok: true
      athleteId: string
      playerId: string
    }
  | {
      ok: false
      error: string
    }

export type RosterStatusWriteResult =
  | {
      ok: true
      playerId: string
      rosterStatus: 'active' | 'inactive'
    }
  | {
      ok: false
      error: string
    }

export type RosterEditResult =
  | {
      ok: true
      playerId: string
      athleteId: string
      displayName: string
      jerseyNumber: string | null
      position: string | null
    }
  | {
      ok: false
      error: string
    }

export type AssignableAthletesResult =
  | {
      ok: true
      athletes: AssignableAthlete[]
    }
  | {
      ok: false
      error: string
    }

type RosterAccessContext = {
  organizationId: string
  teamId: string
  isOrgAdmin: boolean
}

async function requireRosterAccess(
  teamSeasonId: string
): Promise<
  | { ok: true; context: RosterAccessContext }
  | { ok: false; error: string }
> {
  if (!teamSeasonId) {
    return { ok: false, error: 'Missing team-season' }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, error: 'Not authenticated' }
  }

  const { data: teamSeason, error: teamSeasonError } = await supabase
    .from('team_seasons')
    .select('organization_id, team_id')
    .eq('id', teamSeasonId)
    .single()

  if (teamSeasonError || !teamSeason) {
    return {
      ok: false,
      error: teamSeasonError?.message || 'Team-season not found',
    }
  }

  const { data: canAdmin, error: accessError } = await supabase.rpc(
    'can_admin_team_season',
    {
      target_team_season_id: teamSeasonId,
    }
  )

  if (accessError) {
    return { ok: false, error: accessError.message }
  }

  if (!canAdmin) {
    return { ok: false, error: 'Not authorized to manage this roster' }
  }

  const { data: isOrgAdmin, error: orgAdminError } = await supabase.rpc(
    'is_org_admin',
    {
      org_id: teamSeason.organization_id,
    }
  )

  if (orgAdminError) {
    return { ok: false, error: orgAdminError.message }
  }

  return {
    ok: true,
    context: {
      organizationId: teamSeason.organization_id,
      teamId: teamSeason.team_id,
      isOrgAdmin: Boolean(isOrgAdmin),
    },
  }
}

async function requirePlayerRosterAccess(
  playerId: string
): Promise<
  | {
      ok: true
      teamSeasonId: string
    }
  | {
      ok: false
      error: string
    }
> {
  const normalizedPlayerId = playerId.trim()

  if (!normalizedPlayerId) {
    return { ok: false, error: 'Missing roster assignment' }
  }

  const supabase = await createClient()

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('team_season_id')
    .eq('id', normalizedPlayerId)
    .single()

  if (playerError || !player?.team_season_id) {
    return {
      ok: false,
      error: playerError?.message || 'Roster assignment not found',
    }
  }

  const access = await requireRosterAccess(player.team_season_id)

  if (!access.ok) {
    return access
  }

  return {
    ok: true,
    teamSeasonId: player.team_season_id,
  }
}

function refreshRosterPaths() {
  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath('/team')
  revalidatePath('/roster')
  revalidatePath('/stats')
}

export async function createAthleteRosterAssignment(input: {
  teamSeasonId: string
  displayName: string
  jerseyNumber?: string
  position?: string
}): Promise<RosterWriteResult> {
  const teamSeasonId = input.teamSeasonId.trim()
  const displayName = input.displayName.trim()
  const jerseyNumber = input.jerseyNumber?.trim() || null
  const position = input.position?.trim() || null

  if (!teamSeasonId) {
    return { ok: false, error: 'Missing team-season' }
  }

  if (!displayName) {
    return { ok: false, error: 'Player name is required' }
  }

  const access = await requireRosterAccess(teamSeasonId)

  if (!access.ok) {
    return access
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'create_athlete_roster_assignment',
    {
      p_team_season_id: teamSeasonId,
      p_display_name: displayName,
      p_jersey_number: jerseyNumber,
      p_position: position,
    }
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  const created = Array.isArray(data) ? data[0] : data

  if (!created?.athlete_id || !created?.player_id) {
    return { ok: false, error: 'Roster assignment was not returned' }
  }

  refreshRosterPaths()

  return {
    ok: true,
    athleteId: created.athlete_id,
    playerId: created.player_id,
  }
}

export async function assignExistingAthleteToTeamSeason(input: {
  athleteId: string
  teamSeasonId: string
  jerseyNumber?: string
  position?: string
}): Promise<RosterWriteResult> {
  const athleteId = input.athleteId.trim()
  const teamSeasonId = input.teamSeasonId.trim()
  const jerseyNumber = input.jerseyNumber?.trim() || null
  const position = input.position?.trim() || null

  if (!athleteId) {
    return { ok: false, error: 'Select an athlete' }
  }

  if (!teamSeasonId) {
    return { ok: false, error: 'Missing team-season' }
  }

  const access = await requireRosterAccess(teamSeasonId)

  if (!access.ok) {
    return access
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'assign_existing_athlete_to_team_season',
    {
      p_athlete_id: athleteId,
      p_team_season_id: teamSeasonId,
      p_jersey_number: jerseyNumber,
      p_position: position,
    }
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  const created = Array.isArray(data) ? data[0] : data

  if (!created?.athlete_id || !created?.player_id) {
    return { ok: false, error: 'Roster assignment was not returned' }
  }

  refreshRosterPaths()

  return {
    ok: true,
    athleteId: created.athlete_id,
    playerId: created.player_id,
  }
}

export async function getAssignableAthletes(
  teamSeasonId: string
): Promise<AssignableAthletesResult> {
  const normalizedTeamSeasonId = teamSeasonId.trim()

  const access = await requireRosterAccess(normalizedTeamSeasonId)

  if (!access.ok) {
    return access
  }

  const supabase = await createClient()
  const { organizationId, teamId, isOrgAdmin } = access.context

  const { data: assignedRows, error: assignedError } = await supabase
    .from('players')
    .select('athlete_id')
    .eq('team_season_id', normalizedTeamSeasonId)
    .not('athlete_id', 'is', null)

  if (assignedError) {
    return { ok: false, error: assignedError.message }
  }

  const assignedAthleteIds = new Set(
    (assignedRows ?? [])
      .map(row => row.athlete_id)
      .filter((id): id is string => Boolean(id))
  )

  const { data: athleteRows, error: athleteError } = await supabase
    .from('athletes')
    .select('id, display_name, status')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('display_name', { ascending: true })

  if (athleteError) {
    return { ok: false, error: athleteError.message }
  }

  const candidateAthletes = (athleteRows ?? []).filter(
    athlete => !assignedAthleteIds.has(athlete.id)
  )

  if (candidateAthletes.length === 0) {
    return { ok: true, athletes: [] }
  }

  const candidateIds = candidateAthletes.map(athlete => athlete.id)

  let historyQuery = supabase
    .from('players')
    .select('athlete_id, jersey_number, position, team_id, created_at')
    .in('athlete_id', candidateIds)
    .order('created_at', { ascending: false })

  // Team admins may only bring back athletes who previously belonged
  // to their permanent team. Org admins may assign across teams.
  if (!isOrgAdmin) {
    historyQuery = historyQuery.eq('team_id', teamId)
  }

  const { data: historyRows, error: historyError } = await historyQuery

  if (historyError) {
    return { ok: false, error: historyError.message }
  }

  const latestHistoryByAthlete = new Map<
    string,
    {
      jerseyNumber: string | null
      position: string | null
    }
  >()

  for (const row of historyRows ?? []) {
    if (!row.athlete_id || latestHistoryByAthlete.has(row.athlete_id)) {
      continue
    }

    latestHistoryByAthlete.set(row.athlete_id, {
      jerseyNumber: row.jersey_number,
      position: row.position,
    })
  }

  const athletes = candidateAthletes
    .filter(athlete => {
      if (isOrgAdmin) return true
      return latestHistoryByAthlete.has(athlete.id)
    })
    .map(athlete => {
      const previous = latestHistoryByAthlete.get(athlete.id)

      return {
        id: athlete.id,
        displayName: athlete.display_name,
        status: athlete.status,
        previousJerseyNumber: previous?.jerseyNumber ?? null,
        previousPosition: previous?.position ?? null,
      }
    })

  return { ok: true, athletes }
}

export async function updateRosterAssignment(input: {
  playerId: string
  displayName: string
  jerseyNumber?: string
  position?: string
}): Promise<RosterEditResult> {
  const playerId = input.playerId.trim()
  const displayName = input.displayName.trim()
  const jerseyNumber = input.jerseyNumber?.trim() || null
  const position = input.position?.trim() || null

  if (!playerId) {
    return { ok: false, error: 'Missing roster assignment' }
  }

  if (!displayName) {
    return { ok: false, error: 'Player name is required' }
  }

  const access = await requirePlayerRosterAccess(playerId)

  if (!access.ok) {
    return access
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'update_roster_assignment',
    {
      p_player_id: playerId,
      p_display_name: displayName,
      p_jersey_number: jerseyNumber,
      p_position: position,
    }
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  const updated = Array.isArray(data) ? data[0] : data

  if (
    !updated?.result_player_id ||
    !updated?.result_athlete_id ||
    !updated?.result_display_name
  ) {
    return {
      ok: false,
      error: 'Updated roster assignment was not returned',
    }
  }

  refreshRosterPaths()

  return {
    ok: true,
    playerId: updated.result_player_id,
    athleteId: updated.result_athlete_id,
    displayName: updated.result_display_name,
    jerseyNumber: updated.result_jersey_number ?? null,
    position: updated.result_position ?? null,
  }
}

export async function removePlayerFromRoster(input: {
  playerId: string
  reason?: string
}): Promise<RosterStatusWriteResult> {
  const playerId = input.playerId.trim()
  const reason = input.reason?.trim() || null

  const access = await requirePlayerRosterAccess(playerId)

  if (!access.ok) {
    return access
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'remove_player_from_roster',
    {
      p_player_id: playerId,
      p_reason: reason,
    }
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  const updated = Array.isArray(data) ? data[0] : data

  if (
    !updated?.result_player_id ||
    updated.result_roster_status !== 'inactive'
  ) {
    return {
      ok: false,
      error: 'Updated roster assignment was not returned',
    }
  }

  refreshRosterPaths()

  return {
    ok: true,
    playerId: updated.result_player_id,
    rosterStatus: 'inactive',
  }
}

export async function restorePlayerToRoster(
  playerId: string
): Promise<RosterStatusWriteResult> {
  const normalizedPlayerId = playerId.trim()

  const access = await requirePlayerRosterAccess(normalizedPlayerId)

  if (!access.ok) {
    return access
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc(
    'restore_player_to_roster',
    {
      p_player_id: normalizedPlayerId,
    }
  )

  if (error) {
    return { ok: false, error: error.message }
  }

  const updated = Array.isArray(data) ? data[0] : data

  if (
    !updated?.result_player_id ||
    updated.result_roster_status !== 'active'
  ) {
    return {
      ok: false,
      error: 'Restored roster assignment was not returned',
    }
  }

  refreshRosterPaths()

  return {
    ok: true,
    playerId: updated.result_player_id,
    rosterStatus: 'active',
  }
}